#!/bin/bash

# sync-all.sh - Unified sync orchestrator for all storage-hosted submodules and parent repo
#
# Syncs in correct dependency order: submodules first, then parent with deferred pointer commits.
#
# Usage:
#   sync-all.sh [--verbose]
#
# Called by:
#   - Post-commit hooks (event-driven, backgrounded)
#   - Scheduled command every 30s (fallback)
#
# Key invariants:
#   - Never rebase/merge when dirty (ignoring submodules): push-only if ahead, skip otherwise
#   - Parent repo uses merge (not rebase) for diverged state
#   - Submodule repos use rebase for diverged state
#   - Pointer commits deferred to push time to eliminate competing pointer commits
#
# Behavior:
#   1. Acquires global lock to prevent concurrent orchestrator runs
#   2. Syncs each storage-hosted submodule (auto-commit, fetch, sync_repo with rebase)
#   3. Detects pointer drift, commits if clean, then syncs parent (fetch, sync_repo with merge)
#   Each step tolerates failures and continues to the next

set -o pipefail

# Parse arguments
VERBOSE=false
for arg in "$@"; do
    case "$arg" in
        --verbose) VERBOSE=true ;;
    esac
done

log() {
    echo "[sync-all] $*"
}

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo "[sync-all] $*"
    fi
}

log_error() {
    echo "[sync-all] ERROR: $*" >&2
}

# Require USER_BASE_DIRECTORY to be set
source "$(dirname "$0")/lib/paths.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Ensure SSH agent is reachable for git operations.
# PM2 and other long-running processes may retain a stale SSH_AUTH_SOCK from a
# previous login session. On macOS, the launchd agent socket is the canonical
# source; fall back to it when the current socket is missing.
if [ -n "$SSH_AUTH_SOCK" ] && [ ! -S "$SSH_AUTH_SOCK" ]; then
    # Current socket is stale (file doesn't exist or isn't a socket)
    LAUNCHD_SOCK=$(ls /private/tmp/com.apple.launchd.*/Listeners 2>/dev/null | head -1)
    if [ -n "$LAUNCHD_SOCK" ] && [ -S "$LAUNCHD_SOCK" ]; then
        export SSH_AUTH_SOCK="$LAUNCHD_SOCK"
        log "SSH agent socket was stale, switched to launchd socket"
    fi
elif [ -z "$SSH_AUTH_SOCK" ]; then
    # No socket at all -- try launchd
    LAUNCHD_SOCK=$(ls /private/tmp/com.apple.launchd.*/Listeners 2>/dev/null | head -1)
    if [ -n "$LAUNCHD_SOCK" ] && [ -S "$LAUNCHD_SOCK" ]; then
        export SSH_AUTH_SOCK="$LAUNCHD_SOCK"
        log "No SSH agent socket, using launchd socket"
    fi
fi

# Ensure SSH works for git operations (hook environments may lack proper SSH config)
if [ -z "$GIT_SSH_COMMAND" ]; then
    unset GIT_SSH_COMMAND
fi

# Global lock to prevent concurrent orchestrator runs
LOCKFILE="/tmp/sync-all.lock"
if command -v flock >/dev/null 2>&1; then
    exec 200>"$LOCKFILE"
    if ! flock -n 200; then
        log "Another sync-all instance is running, exiting"
        exit 0
    fi
else
    # macOS fallback: PID-based lock with stale detection
    if ( set -o noclobber; echo $$ > "$LOCKFILE" ) 2>/dev/null; then
        trap 'rm -f "$LOCKFILE"' EXIT INT TERM
    elif [ -f "$LOCKFILE" ]; then
        lock_pid=$(cat "$LOCKFILE" 2>/dev/null) || true
        if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
            log "Another sync-all instance is running (PID $lock_pid), exiting"
            exit 0
        fi
        rm -f "$LOCKFILE"
        if ( set -o noclobber; echo $$ > "$LOCKFILE" ) 2>/dev/null; then
            trap 'rm -f "$LOCKFILE"' EXIT INT TERM
        else
            log "Another sync-all instance is running, exiting"
            exit 0
        fi
    fi
fi

# Track overall status
ERRORS=0

# --- Configuration ---
# Storage-hosted submodules with their sync properties
# Format: path:auto_commit:lock_name
# auto_commit: yes = has generated files that need auto-commit before push
# lock_name: lockfile name shared with auto-commit scripts (empty if none)
STORAGE_SUBMODULES=(
    "thread:yes:auto-commit-threads"
    "import-history:yes:auto-commit-import-history"
    "repository/active/homelab:no:"
    "repository/active/base-ios:no:"
    "text/epstein/transparency-act:no:"
    "content-feed:no:"
)

# --- Helper Functions ---

# Check if a submodule is initialized
is_submodule_initialized() {
    local submodule_path="$1"
    local full_path="$USER_BASE_DIRECTORY/$submodule_path"
    [ -d "$full_path/.git" ] || [ -f "$full_path/.git" ]
}

# Check for merge/rebase in progress.
# Detects and auto-recovers from two types of stale rebase state:
# 1. Corrupt state: rebase-merge/rebase-apply directory missing critical files (head-name)
# 2. Stuck state: rebase directory older than STALE_REBASE_MINUTES, indicating a rebase
#    that was interrupted or stalled (e.g., landed in "editing commit" state) and will
#    never resolve unattended. Safe to abort because no human is doing interactive
#    rebases on these automated-sync repos.
STALE_REBASE_MINUTES=5
check_git_state() {
    local dir="$1"
    local git_dir
    git_dir=$(git -C "$dir" rev-parse --git-dir 2>/dev/null) || return 1

    if [ -f "$git_dir/MERGE_HEAD" ]; then
        # Check if merge is fully resolved (no unmerged files) -- can be committed
        local merge_unmerged
        merge_unmerged=$(git -C "$dir" ls-files -u 2>/dev/null)
        if [ -z "$merge_unmerged" ]; then
            log "$dir: stale merge in progress (fully resolved), committing..."
            if GIT_EDITOR=true git -C "$dir" commit --no-edit 2>/dev/null; then
                log "$dir: recovered stale merge via commit"
                return 0
            fi
        fi
        # Merge has unresolved conflicts or commit failed -- check age for abort
        local merge_mtime
        if stat -f %m "$git_dir/MERGE_HEAD" >/dev/null 2>&1; then
            merge_mtime=$(stat -f %m "$git_dir/MERGE_HEAD")
        else
            merge_mtime=$(stat -c %Y "$git_dir/MERGE_HEAD")
        fi
        local now
        now=$(date +%s)
        local merge_age_minutes=$(( (now - merge_mtime) / 60 ))
        if [ $merge_age_minutes -ge $STALE_REBASE_MINUTES ]; then
            log "$dir: stale merge (${merge_age_minutes}m old), aborting..."
            if git -C "$dir" merge --abort 2>/dev/null; then
                log "$dir: recovered from stale merge via abort"
                return 0
            fi
            log_error "$dir: merge --abort failed for stale merge"
            discord_notify_failure "$(basename "$dir")" "stale merge recovery failed"
            return 1
        fi
        log_error "$dir: merge in progress (${merge_age_minutes}m old), skipping"
        return 1
    fi

    local rebase_dir=""
    if [ -d "$git_dir/rebase-merge" ]; then
        rebase_dir="$git_dir/rebase-merge"
    elif [ -d "$git_dir/rebase-apply" ]; then
        rebase_dir="$git_dir/rebase-apply"
    fi

    if [ -n "$rebase_dir" ]; then
        local should_recover=false
        local reason=""

        if [ ! -f "$rebase_dir/head-name" ]; then
            # Corrupt state -- missing critical files
            should_recover=true
            reason="corrupt rebase state (missing head-name)"
        else
            # Check age of the rebase directory. On macOS, stat -f %m gives
            # mtime as epoch seconds; on Linux, stat -c %Y.
            local rebase_mtime
            if stat -f %m "$rebase_dir" >/dev/null 2>&1; then
                rebase_mtime=$(stat -f %m "$rebase_dir")
            else
                rebase_mtime=$(stat -c %Y "$rebase_dir")
            fi
            local now
            now=$(date +%s)
            local age_minutes=$(( (now - rebase_mtime) / 60 ))
            if [ $age_minutes -ge $STALE_REBASE_MINUTES ]; then
                should_recover=true
                reason="stuck rebase (${age_minutes}m old, threshold ${STALE_REBASE_MINUTES}m)"
            fi
        fi

        if [ "$should_recover" = true ]; then
            log "$dir: detected $reason, recovering..."
            if ! git -C "$dir" rebase --abort 2>/dev/null; then
                # No rm -rf fallback: skip and notify instead of risking data loss
                log_error "$dir: rebase --abort failed for $reason, skipping"
                discord_notify_failure "$(basename "$dir")" "stale rebase recovery failed ($reason)"
                return 1
            fi
            log "$dir: recovered from $reason"
            return 0
        fi
        log_error "$dir: rebase in progress, skipping"
        return 1
    fi
    return 0
}

# Ensure merge driver git config is present for thread/import-history submodules
ensure_thread_merge_drivers() {
    local full_path="$1"

    # Check if the primary driver is already configured
    if git -C "$full_path" config --local merge.json-field-merge.driver >/dev/null 2>&1; then
        return 0
    fi

    log_verbose "Configuring merge drivers for $(basename "$full_path")..."

    # json-field-merge (metadata.json)
    git -C "$full_path" config --local merge.json-field-merge.name "JSON field-level merge driver"
    git -C "$full_path" config --local merge.json-field-merge.driver "node $SCRIPT_DIR/json-merge-driver.mjs %O %A %B"

    # jsonl-append-merge (timeline.jsonl, claude-session.jsonl)
    git -C "$full_path" config --local merge.jsonl-append-merge.name "JSONL append-only merge driver"
    git -C "$full_path" config --local merge.jsonl-append-merge.driver "node $SCRIPT_DIR/jsonl-merge-driver.mjs %O %A %B"

    # json-larger-file (normalized-session.json)
    git -C "$full_path" config --local merge.json-larger-file.name "JSON take-larger-file merge driver"
    git -C "$full_path" config --local merge.json-larger-file.driver "node $SCRIPT_DIR/json-larger-file-merge-driver.mjs %O %A %B"
}

# Log a sync telemetry event to JSONL file.
# Args: $1 = repo name, $2 = event type, $3 = details (optional, format varies by event)
# Throttled events (dirty_skip) are only logged on state transitions to reduce volume.
log_telemetry() {
    local repo="$1"
    local event="$2"
    local details="$3"
    local telemetry_file="$USER_BASE_DIRECTORY/data/sync-telemetry.jsonl"
    local ts hostname_val
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    hostname_val=$(hostname)

    # Throttle dirty_skip: only log on state entry (first dirty_skip per repo)
    # and on periodic intervals (every DIRTY_SKIP_LOG_INTERVAL_MINUTES)
    if [ "$event" = "dirty_skip" ]; then
        local throttle_marker="/tmp/sync-telemetry-dirty-${repo}.marker"
        if [ -f "$throttle_marker" ]; then
            local last_logged
            last_logged=$(cat "$throttle_marker" 2>/dev/null) || return
            local now
            now=$(date +%s)
            local elapsed_minutes=$(( (now - last_logged) / 60 ))
            if [ $elapsed_minutes -lt ${DIRTY_SKIP_LOG_INTERVAL_MINUTES:-5} ]; then
                return
            fi
        fi
        date +%s > "$throttle_marker"
    fi

    # Clear dirty_skip throttle marker when repo transitions to a non-dirty state
    if [ "$event" != "dirty_skip" ]; then
        rm -f "/tmp/sync-telemetry-dirty-${repo}.marker"
    fi

    mkdir -p "$(dirname "$telemetry_file")"
    if [ -n "$details" ]; then
        jq -nc --arg ts "$ts" --arg repo "$repo" --arg host "$hostname_val" \
            --arg event "$event" --arg details "$details" \
            '{ts:$ts,repo:$repo,host:$host,event:$event,details:$details}' \
            >> "$telemetry_file" 2>/dev/null || true
    else
        jq -nc --arg ts "$ts" --arg repo "$repo" --arg host "$hostname_val" \
            --arg event "$event" \
            '{ts:$ts,repo:$repo,host:$host,event:$event}' \
            >> "$telemetry_file" 2>/dev/null || true
    fi
}

# Track persistent dirty-skip state and alert after threshold.
# Uses marker files in /tmp to track when a repo first entered dirty-skip.
# Args: $1 = repo name, $2 = dirty file count
DIRTY_ALERT_MINUTES=30
check_dirty_duration() {
    local repo="$1"
    local dirty_count="$2"
    local marker="/tmp/sync-dirty-${repo}.marker"

    if [ ! -f "$marker" ]; then
        date +%s > "$marker"
        return
    fi

    local first_dirty
    first_dirty=$(cat "$marker" 2>/dev/null) || return
    local now
    now=$(date +%s)
    local age_minutes=$(( (now - first_dirty) / 60 ))

    if [ $age_minutes -ge $DIRTY_ALERT_MINUTES ]; then
        discord_notify_failure "$repo" "dirty for ${age_minutes}m ($dirty_count files), sync blocked"
        # Reset marker to avoid spamming (will re-alert after another threshold period)
        date +%s > "$marker"
    fi
}

# Clear dirty-skip marker when a repo syncs successfully.
# Args: $1 = repo name
clear_dirty_marker() {
    rm -f "/tmp/sync-dirty-${1}.marker"
}

# Send Discord notification for sync failures.
# Args: $1 = repo name, $2 = error description
discord_notify_failure() {
    local repo="$1"
    local error_desc="$2"
    "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
        --title "Sync failed: $repo" \
        --message "sync-all: $error_desc on $(hostname), manual intervention required" 2>/dev/null || true
}

# sync_repo - Unified sync function for any git repository.
# Handles all 4 divergence states with dirty-state safety invariant:
#   - Dirty + ahead: push only
#   - Dirty + anything else: skip (wait for next cycle)
#   - Clean + up-to-date: nothing
#   - Clean + behind: fast-forward merge
#   - Clean + ahead: push with single retry on contention
#   - Clean + diverged: merge (if use_merge) or rebase, then push
#
# Args:
#   $1 = repo directory path
#   $2 = use_merge: "true" for parent repo (merge on diverge), "false" for submodules (rebase)
#   $3 = retry: "true" if this is a retry attempt (prevents infinite loops)
# Returns: 0 on success, 1 on failure
sync_repo() {
    local dir="$1"
    local use_merge="${2:-false}"
    local retry="${3:-false}"
    local repo_name
    repo_name=$(basename "$dir")

    # Fetch
    if ! git -C "$dir" fetch origin 2>/dev/null; then
        log_error "$repo_name: fetch failed"
        return 1
    fi

    local current_branch
    current_branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD)
    local remote_branch="origin/$current_branch"

    # Check if remote branch exists
    if ! git -C "$dir" rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
        log_verbose "$repo_name: no remote branch, pushing..."
        git -C "$dir" push -u origin "$current_branch" 2>/dev/null || {
            log_error "$repo_name: push failed"
            return 1
        }
        return 0
    fi

    local local_commit remote_commit merge_base
    local_commit=$(git -C "$dir" rev-parse HEAD)
    remote_commit=$(git -C "$dir" rev-parse "$remote_branch")
    merge_base=$(git -C "$dir" merge-base HEAD "$remote_branch")

    # Check dirty state (ignoring submodules)
    local is_dirty=false
    if ! git -C "$dir" diff --quiet --ignore-submodules 2>/dev/null || \
       ! git -C "$dir" diff --cached --quiet --ignore-submodules 2>/dev/null; then
        is_dirty=true
    fi

    # Hard invariant: never merge/rebase when dirty
    if [ "$is_dirty" = true ]; then
        if [ "$remote_commit" = "$merge_base" ] && [ "$local_commit" != "$remote_commit" ]; then
            # Ahead of remote while dirty - safe to push
            log "$repo_name: dirty but ahead, pushing..."
            git -C "$dir" push origin "$current_branch" 2>/dev/null || {
                log_error "$repo_name: push failed (dirty+ahead)"
                return 1
            }
            log_telemetry "$repo_name" "dirty_push" ""
            clear_dirty_marker "$repo_name"
        else
            local dirty_count
            dirty_count=$(git -C "$dir" status --porcelain --ignore-submodules 2>/dev/null | wc -l | tr -d ' ')
            log_verbose "$repo_name: dirty ($dirty_count files), skipping sync"
            log_telemetry "$repo_name" "dirty_skip" "files:$dirty_count"
            check_dirty_duration "$repo_name" "$dirty_count"
        fi
        return 0
    fi

    # Clean working directory - clear dirty marker and handle 4-way divergence
    clear_dirty_marker "$repo_name"

    if [ "$local_commit" = "$remote_commit" ]; then
        log_verbose "$repo_name: up to date"
        return 0

    elif [ "$local_commit" = "$merge_base" ]; then
        # Behind remote - fast-forward merge (always safe when strictly behind)
        log "$repo_name: behind remote, fast-forwarding..."
        if ! git -C "$dir" merge --ff-only "$remote_branch" 2>/dev/null; then
            log_error "$repo_name: fast-forward merge failed"
            return 1
        fi
        log "$repo_name: fast-forwarded successfully"
        # Update base submodule after pulling parent
        if [ "$use_merge" = true ]; then
            git -C "$dir" submodule update --init repository/active/base 2>/dev/null || true
        fi
        log_telemetry "$repo_name" "sync" "behind:ff_merge"
        return 0

    elif [ "$remote_commit" = "$merge_base" ]; then
        # Ahead of remote - push with single retry on contention
        log "$repo_name: ahead of remote, pushing..."
        if git -C "$dir" push origin "$current_branch" 2>/dev/null; then
            log_telemetry "$repo_name" "sync" "ahead:push"
            return 0
        fi
        # Push failed - re-fetch and retry once
        if [ "$retry" = true ]; then
            log_error "$repo_name: push failed on retry"
            return 1
        fi
        log "$repo_name: push contention, retrying..."
        sync_repo "$dir" "$use_merge" "true"
        return $?

    else
        # Diverged
        if [ "$use_merge" = true ]; then
            # Parent repo: merge with submodule conflict auto-resolution
            log "$repo_name: diverged, merging..."
            if ! git -C "$dir" merge "$remote_branch" 2>/dev/null; then
                # Check for unmerged files
                local unmerged
                unmerged=$(git -C "$dir" ls-files -u 2>/dev/null)
                if [ -z "$unmerged" ]; then
                    # No unmerged files -- merge resolved cleanly but needs committing
                    # (e.g., dirty submodule pointers caused non-zero exit from git merge)
                    if [ -f "$(git -C "$dir" rev-parse --git-dir)/MERGE_HEAD" ]; then
                        log "$repo_name: merge resolved cleanly, committing..."
                        if GIT_EDITOR=true git -C "$dir" commit --no-edit 2>/dev/null; then
                            log "$repo_name: merge committed"
                            log_telemetry "$repo_name" "sync" "diverged:merge_commit_recovery"
                        else
                            git -C "$dir" merge --abort 2>/dev/null || true
                            log_error "$repo_name: merge commit failed after clean resolution"
                            discord_notify_failure "$repo_name" "merge commit failed"
                            log_telemetry "$repo_name" "merge_failed" "commit_recovery_failed"
                            return 1
                        fi
                    else
                        git -C "$dir" merge --abort 2>/dev/null || true
                        log_error "$repo_name: merge failed (unknown error, no MERGE_HEAD)"
                        discord_notify_failure "$repo_name" "merge failed"
                        log_telemetry "$repo_name" "merge_failed" "no_unmerged"
                        return 1
                    fi
                fi
                # Check if ALL conflicts are submodule pointers (mode 160000)
                local has_file_conflict
                has_file_conflict=$(echo "$unmerged" | awk '$1 != "160000"' | head -1)
                if [ -n "$has_file_conflict" ]; then
                    git -C "$dir" merge --abort 2>/dev/null || true
                    log_error "$repo_name: merge has non-submodule conflicts, aborting"
                    discord_notify_failure "$repo_name" "merge conflict (non-submodule files)"
                    log_telemetry "$repo_name" "merge_failed" "file_conflict"
                    return 1
                fi
                # All conflicts are submodule pointers - auto-resolve with current HEAD
                local conflict_paths
                conflict_paths=$(echo "$unmerged" | awk '{print $4}' | sort -u)
                while IFS= read -r conflict_path; do
                    git -C "$dir" add "$conflict_path" 2>/dev/null
                    log_verbose "$repo_name: auto-resolved submodule conflict: $conflict_path"
                done <<< "$conflict_paths"
                # Complete the merge
                if ! GIT_EDITOR=true git -C "$dir" merge --continue 2>/dev/null; then
                    git -C "$dir" merge --abort 2>/dev/null || true
                    log_error "$repo_name: merge --continue failed"
                    discord_notify_failure "$repo_name" "merge continue failed"
                    log_telemetry "$repo_name" "merge_failed" "continue_failed"
                    return 1
                fi
            fi
            log "$repo_name: merged successfully"
            git -C "$dir" submodule update --init repository/active/base 2>/dev/null || true
            log_telemetry "$repo_name" "sync" "diverged:merge"
        else
            # Submodule: rebase (autostash for dirty submodule pointers from GitHub repos)
            log "$repo_name: diverged, rebasing..."
            if ! git -C "$dir" rebase --autostash "$remote_branch" 2>/dev/null; then
                git -C "$dir" rebase --abort 2>/dev/null || true
                log_error "$repo_name: rebase failed (diverged)"
                discord_notify_failure "$repo_name" "rebase failed (diverged)"
                log_telemetry "$repo_name" "rebase_failed" "diverged"
                return 1
            fi
            log "$repo_name: rebased successfully"
            log_telemetry "$repo_name" "sync" "diverged:rebase"
        fi

        # Push after successful merge/rebase if ahead
        local new_local new_remote
        new_local=$(git -C "$dir" rev-parse HEAD)
        new_remote=$(git -C "$dir" rev-parse "$remote_branch")
        if [ "$new_local" != "$new_remote" ]; then
            log "$repo_name: pushing..."
            if git -C "$dir" push origin "$current_branch" 2>/dev/null; then
                return 0
            fi
            # Push failed after merge/rebase - retry once
            if [ "$retry" = true ]; then
                log_error "$repo_name: push failed after merge/rebase on retry"
                return 1
            fi
            log "$repo_name: push contention after merge/rebase, retrying..."
            sync_repo "$dir" "$use_merge" "true"
            return $?
        fi
        return 0
    fi
}

# Sync a single submodule: auto-commit, detached HEAD recovery, merge drivers, then sync_repo()
sync_submodule() {
    local submodule_path="$1"
    local auto_commit="$2"
    local lock_name="$3"
    local full_path="$USER_BASE_DIRECTORY/$submodule_path"
    local submodule_name
    submodule_name=$(basename "$submodule_path")

    if ! is_submodule_initialized "$submodule_path"; then
        log_verbose "$submodule_name: not initialized, skipping"
        return 0
    fi

    if ! check_git_state "$full_path"; then
        return 1
    fi

    # Ensure merge drivers are configured for thread-like submodules
    if [ "$submodule_name" = "thread" ] || [ "$submodule_name" = "import-history" ]; then
        ensure_thread_merge_drivers "$full_path"
    fi

    log_verbose "Syncing $submodule_name..."

    # Auto-commit if applicable
    if [ "$auto_commit" = "yes" ]; then
        local auto_commit_script="$SCRIPT_DIR/auto-commit-${submodule_name}.sh"
        if [ -x "$auto_commit_script" ]; then
            log_verbose "$submodule_name: running auto-commit..."
            "$auto_commit_script" --skip-lock 2>&1 | while read -r line; do log_verbose "  $line"; done || true
        fi
    fi

    # Ensure we're on a branch (not detached HEAD)
    local current_branch
    current_branch=$(git -C "$full_path" rev-parse --abbrev-ref HEAD)
    if [ "$current_branch" = "HEAD" ]; then
        log "$submodule_name: detached HEAD, checking out main..."
        if ! git -C "$full_path" checkout main 2>/dev/null; then
            log_error "$submodule_name: failed to checkout main from detached HEAD"
            return 1
        fi
    fi

    # Delegate to unified sync function (submodules use rebase for diverged state)
    sync_repo "$full_path" "false"
}

# --- Step 1: Sync storage-hosted submodules ---

log_verbose "Step 1: Syncing storage-hosted submodules..."

for entry in "${STORAGE_SUBMODULES[@]}"; do
    IFS=':' read -r path auto_commit lock_name <<< "$entry"
    if ! sync_submodule "$path" "$auto_commit" "$lock_name"; then
        ERRORS=$((ERRORS + 1))
    fi
done

# --- Step 2: Detect pointer drift, commit if needed, sync parent repo ---

log_verbose "Step 2: Syncing parent repo (with deferred pointer commits)..."

cd "$USER_BASE_DIRECTORY"

if ! check_git_state "$USER_BASE_DIRECTORY"; then
    log_error "Parent repo has git operation in progress, skipping"
    ERRORS=$((ERRORS + 1))
else
    # Check dirty state before pointer detection (ignoring submodules)
    PARENT_IS_DIRTY=false
    if ! git diff --quiet --ignore-submodules 2>/dev/null || \
       ! git diff --cached --quiet --ignore-submodules 2>/dev/null; then
        PARENT_IS_DIRTY=true
    fi

    # Detect and commit pointer drift only when clean.
    # Pointer commits are deferred to push time to eliminate the window where
    # both machines create competing pointer commits.
    if [ "$PARENT_IS_DIRTY" = false ]; then
        POINTER_UPDATED=false
        UPDATED_SUBMODULES=()

        for entry in "${STORAGE_SUBMODULES[@]}"; do
            IFS=':' read -r submodule_path _ _ <<< "$entry"

            # Skip if submodule is not initialized
            if [ ! -d "$submodule_path/.git" ] && [ ! -f "$submodule_path/.git" ]; then
                continue
            fi

            # Compare recorded pointer vs actual HEAD
            recorded=$(git ls-tree HEAD "$submodule_path" 2>/dev/null | awk '{print $3}')
            actual=$(git -C "$submodule_path" rev-parse HEAD 2>/dev/null) || continue

            if [ -z "$recorded" ]; then
                continue
            fi

            if [ "$recorded" != "$actual" ]; then
                log "Updating pointer: $submodule_path (${recorded:0:7} -> ${actual:0:7})"
                git add "$submodule_path"
                POINTER_UPDATED=true
                UPDATED_SUBMODULES+=("$submodule_path")
            fi
        done

        if [ "$POINTER_UPDATED" = true ]; then
            log "Committing pointer updates for: ${UPDATED_SUBMODULES[*]}"
            git commit -m "chore: update submodule pointers" 2>/dev/null || {
                log_error "Failed to commit submodule pointer updates"
                ERRORS=$((ERRORS + 1))
            }
            log_telemetry "user-base" "pointer_commit" "submodules:${UPDATED_SUBMODULES[*]}"
        else
            log_verbose "All submodule pointers are current"
        fi
    else
        log_verbose "Parent dirty, skipping pointer detection"
    fi

    # Sync parent repo (uses merge for diverged state)
    if ! sync_repo "$USER_BASE_DIRECTORY" "true"; then
        ERRORS=$((ERRORS + 1))
    fi
fi

# --- Summary ---

if [ $ERRORS -gt 0 ]; then
    log "Completed with $ERRORS error(s)"
    exit 1
else
    log_verbose "Sync completed successfully"
    exit 0
fi
