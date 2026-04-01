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
#   4. After parent merge/ff, updates all repository/active/ submodule working dirs to match pointers
#   Each step tolerates failures and continues to the next

set -o pipefail

# Parse arguments
VERBOSE=false
for arg in "$@"; do
    case "$arg" in
        --verbose) VERBOSE=true ;;
    esac
done

# Migration sentinel: halt all sync-all invocations during migration window
if [ -f /tmp/sync-all-migration.disable ]; then
    echo "[sync-all] Migration sentinel detected, exiting (remove /tmp/sync-all-migration.disable to re-enable)"
    exit 0
fi

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
#
# Loaded from user-base config/storage-submodules.conf.
# Falls back to core submodules only (thread + import-history) if config not found.
SUBMODULES_CONF="$USER_BASE_DIRECTORY/config/storage-submodules.conf"
STORAGE_SUBMODULES=()
if [ -f "$SUBMODULES_CONF" ]; then
    while IFS= read -r line; do
        # Skip comments and blank lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        STORAGE_SUBMODULES+=("$line")
    done < "$SUBMODULES_CONF"
    log_verbose "Loaded ${#STORAGE_SUBMODULES[@]} submodules from $SUBMODULES_CONF"
else
    # Core defaults only -- user-specific submodules belong in config
    STORAGE_SUBMODULES=(
        "thread:yes:auto-commit-threads"
        "import-history:yes:auto-commit-import-history"
    )
    log "No storage-submodules.conf found, using core defaults only"
fi

# --- Helper Functions ---

# Check if a submodule is initialized
is_submodule_initialized() {
    local submodule_path="$1"
    local full_path="$USER_BASE_DIRECTORY/$submodule_path"
    [ -d "$full_path/.git" ] || [ -f "$full_path/.git" ]
}

# Stash untracked files, run an abort command, then restore the stash.
# Returns 0 if the abort succeeded, 1 if it failed. Stash is always restored
# (or left in stash list on pop failure) regardless of abort outcome.
# Args: $1 = directory, $2 = abort command (e.g., "rebase --abort"), $3 = context label
stash_and_abort() {
    local dir="$1"
    local abort_cmd="$2"
    local context="$3"
    local stashed=false

    if git -C "$dir" ls-files --others --exclude-standard | grep -q .; then
        log "$dir: stashing untracked files before $context abort..."
        if git -C "$dir" stash --include-untracked >/dev/null 2>&1; then
            stashed=true
        else
            log_error "$dir: stash failed, proceeding with abort attempt anyway"
        fi
    fi

    # shellcheck disable=SC2086
    if git -C "$dir" $abort_cmd 2>/dev/null; then
        if [ "$stashed" = true ]; then
            git -C "$dir" stash pop >/dev/null 2>&1 || \
                log_error "$dir: stash pop failed after $context abort, files preserved in stash"
        fi
        return 0
    fi

    # Abort failed -- restore stash so files are not lost
    if [ "$stashed" = true ]; then
        git -C "$dir" stash pop >/dev/null 2>&1 || \
            log_error "$dir: stash pop failed after $context abort failure, files preserved in stash"
    fi
    return 1
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
            if stash_and_abort "$dir" "merge --abort" "merge"; then
                clear_recovery_failure_marker "$dir"
                log "$dir: recovered from stale merge via abort"
                return 0
            fi
            log_error "$dir: merge --abort failed for stale merge"
            check_recovery_failure_throttle "$dir" "stale merge recovery failed (${merge_age_minutes}m old)"
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
            if stash_and_abort "$dir" "rebase --abort" "rebase"; then
                clear_recovery_failure_marker "$dir"
                log "$dir: recovered from $reason"
                return 0
            fi
            log_error "$dir: rebase --abort failed for $reason, skipping"
            check_recovery_failure_throttle "$dir" "stale rebase recovery failed ($reason)"
            return 1
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

    # json-field-merge (metadata.json) -- only remaining driver after bulk data moved to rsync
    git -C "$full_path" config --local merge.json-field-merge.name "JSON field-level merge driver"
    git -C "$full_path" config --local merge.json-field-merge.driver "bun $SCRIPT_DIR/json-merge-driver.mjs %O %A %B"
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

# Exponential backoff for sync alert suppression windows.
# Matches the pattern in report-job.mjs: escalates suppression as failures persist.
# Args: $1 = alert count (number of alerts already sent)
# Returns: suppression window in minutes
get_sync_suppression_minutes() {
    local alert_count="${1:-0}"
    if [ "$alert_count" -le 1 ]; then echo 30;   # 30 min for first 1-2 alerts
    elif [ "$alert_count" -le 3 ]; then echo 120; # 2 hours for alerts 2-3
    elif [ "$alert_count" -le 6 ]; then echo 360; # 6 hours for alerts 4-6
    else echo 720;                                 # 12 hours max
    fi
}

# Track persistent recovery-failure state and alert with exponential backoff.
# Uses marker files in /tmp to throttle repeated alerts for stale rebase/merge
# recovery failures. First failure sends an alert immediately; subsequent failures
# use escalating suppression windows.
# Marker format: <last_alert_epoch> <alert_count>
# Args: $1 = directory path, $2 = reason string
check_recovery_failure_throttle() {
    local dir="$1"
    local reason="$2"
    local repo_name
    repo_name=$(basename "$dir")
    local marker="/tmp/sync-recovery-failure-${repo_name}.marker"

    if [ ! -f "$marker" ]; then
        echo "$(date +%s) 1" > "$marker"
        discord_notify_failure "$repo_name" "$reason"
        return
    fi

    local last_alert alert_count
    read -r last_alert alert_count < "$marker" 2>/dev/null || return
    alert_count=${alert_count:-0}
    local now
    now=$(date +%s)
    local age_minutes=$(( (now - last_alert) / 60 ))
    local suppression
    suppression=$(get_sync_suppression_minutes "$alert_count")

    if [ $age_minutes -ge $suppression ]; then
        alert_count=$(( alert_count + 1 ))
        echo "$(date +%s) $alert_count" > "$marker"
        discord_notify_failure "$repo_name" "$reason (${age_minutes}m since last alert, next in ${suppression}m)"
    fi
}

# Clear recovery-failure marker when a repo recovers successfully.
# Args: $1 = directory path
clear_recovery_failure_marker() {
    local repo_name
    repo_name=$(basename "$1")
    rm -f "/tmp/sync-recovery-failure-${repo_name}.marker"
}

# Track persistent dirty-skip state and alert with exponential backoff.
# Uses marker files in /tmp to track dirty state duration and alert count.
# First alert after 30 minutes of dirty state; subsequent alerts use escalating
# suppression windows via get_sync_suppression_minutes().
# Marker format: <first_dirty_epoch> <last_alert_epoch> <alert_count>
# Args: $1 = repo name, $2 = dirty file count
DIRTY_ALERT_MINUTES=30
DIRTY_ALERT_MINUTES_SESSION_ACTIVE=240  # 4 hours when Claude sessions are running

# Check if Claude Code sessions are actively running on this machine.
# Returns 0 (true) if sessions found, 1 (false) if none.
has_active_claude_sessions() {
    pgrep -x claude >/dev/null 2>&1
}

check_dirty_duration() {
    local repo="$1"
    local dirty_count="$2"
    local marker="/tmp/sync-dirty-${repo}.marker"

    if [ ! -f "$marker" ]; then
        echo "$(date +%s) 0 0" > "$marker"
        return
    fi

    local first_dirty last_alert alert_count
    read -r first_dirty last_alert alert_count < "$marker" 2>/dev/null || return
    last_alert=${last_alert:-0}
    alert_count=${alert_count:-0}
    local now
    now=$(date +%s)
    local total_minutes=$(( (now - first_dirty) / 60 ))

    # Use longer threshold when Claude sessions are active (dirty repo is expected)
    local threshold=$DIRTY_ALERT_MINUTES
    if has_active_claude_sessions; then
        threshold=$DIRTY_ALERT_MINUTES_SESSION_ACTIVE
    fi

    # First alert: wait for initial threshold
    if [ "$alert_count" -eq 0 ]; then
        if [ $total_minutes -ge $threshold ]; then
            echo "$first_dirty $(date +%s) 1" > "$marker"
            local session_note=""
            if has_active_claude_sessions; then
                session_note=" (sessions active)"
            fi
            discord_notify_failure "$repo" "dirty for ${total_minutes}m ($dirty_count files), sync blocked${session_note}"
        fi
        return
    fi

    # Subsequent alerts: use escalating suppression window
    local since_last=$(( (now - last_alert) / 60 ))
    local suppression
    suppression=$(get_sync_suppression_minutes "$alert_count")

    if [ $since_last -ge $suppression ]; then
        alert_count=$(( alert_count + 1 ))
        echo "$first_dirty $(date +%s) $alert_count" > "$marker"
        discord_notify_failure "$repo" "dirty for ${total_minutes}m ($dirty_count files), sync blocked (next alert in ~$(get_sync_suppression_minutes "$alert_count")m)"
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
    "$USER_BASE_DIRECTORY/cli/monitoring/discord-notify.sh" --template service --severity error \
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
        log_telemetry "$repo_name" "fetch_failed" ""
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
        # Initialize any new submodules (register URL only, no checkout)
        if [ "$use_merge" = true ]; then
            git -C "$dir" submodule init -- repository/active/ 2>/dev/null || true
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
                # Check MERGE_HEAD first -- if absent, another process completed the merge
                if [ ! -f "$(git -C "$dir" rev-parse --git-dir)/MERGE_HEAD" ]; then
                    log "$repo_name: merge completed by concurrent process"
                    log_telemetry "$repo_name" "sync" "diverged:merge_completed_externally"
                    return 0
                fi
                # Check for unmerged files
                local unmerged
                unmerged=$(git -C "$dir" ls-files -u 2>/dev/null)
                if [ -z "$unmerged" ]; then
                    # No unmerged files -- merge resolved cleanly but needs committing
                    # (e.g., dirty submodule pointers caused non-zero exit from git merge)
                    log "$repo_name: merge resolved cleanly, committing..."
                    if GIT_EDITOR=true git -C "$dir" commit --no-edit 2>/dev/null; then
                        log "$repo_name: merge committed"
                        log_telemetry "$repo_name" "sync" "diverged:merge_commit_recovery"
                        return 0
                    else
                        git -C "$dir" merge --abort 2>/dev/null || true
                        log_error "$repo_name: merge commit failed after clean resolution"
                        discord_notify_failure "$repo_name" "merge commit failed"
                        log_telemetry "$repo_name" "merge_failed" "commit_recovery_failed"
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
            git -C "$dir" submodule init -- repository/active/ 2>/dev/null || true
            log_telemetry "$repo_name" "sync" "diverged:merge"
        else
            # Submodule: rebase (autostash for dirty submodule pointers from GitHub repos)
            log "$repo_name: diverged, rebasing..."
            local rebase_stderr rebase_rc=0
            rebase_stderr=$(git -C "$dir" rebase --autostash "$remote_branch" 2>&1 >/dev/null) || rebase_rc=$?
            if [ "$rebase_rc" -ne 0 ]; then
                git -C "$dir" rebase --abort 2>/dev/null || true
                local rebase_reason
                rebase_reason=$(echo "$rebase_stderr" | grep -m1 -iE "error:|fatal:" | sed 's/^[[:space:]]*//' | head -c 200)
                log_error "$repo_name: rebase failed (diverged)${rebase_reason:+ -- $rebase_reason}"
                discord_notify_failure "$repo_name" "rebase failed (diverged)${rebase_reason:+ -- $rebase_reason}"
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

    # Check for index contamination at the START of base-ios processing (catches
    # contamination from any source, not just import-history auto-commit).
    if [ "$submodule_name" = "base-ios" ]; then
        local foreign_count
        foreign_count=$(git -C "$full_path" ls-files 2>/dev/null | grep -cE '^(github|notion|reddit|twitter)/' || true)
        if [ "$foreign_count" -gt 0 ]; then
            log_error "base-ios index contaminated with $foreign_count foreign entries (detected at sync start)"
            log_telemetry "base-ios" "index_contamination" "entries:$foreign_count,trigger:pre-sync,cwd:$(pwd),git_dir:${GIT_DIR:-unset},git_worktree:${GIT_WORK_TREE:-unset},ppid:$PPID"
            discord_notify_failure "base-ios" "index contamination detected at sync start: $foreign_count foreign entries"
            log "base-ios: repairing index via git read-tree HEAD..."
            if git -C "$full_path" read-tree HEAD 2>/dev/null; then
                log "base-ios: index repaired successfully"
                log_telemetry "base-ios" "index_repaired" "entries_removed:$foreign_count,trigger:pre-sync"
            else
                log_error "base-ios: git read-tree HEAD failed"
            fi
        fi
    fi

    # Ensure merge drivers are configured for thread-like submodules
    if [ "$submodule_name" = "thread" ] || [ "$submodule_name" = "import-history" ]; then
        ensure_thread_merge_drivers "$full_path"
    fi

    # Ensure pull.rebase is set to prevent accidental merge commits from git pull
    if [ "$(git -C "$full_path" config pull.rebase 2>/dev/null)" != "true" ]; then
        git -C "$full_path" config pull.rebase true
        log_verbose "$submodule_name: set pull.rebase=true"
    fi

    log_verbose "Syncing $submodule_name..."

    # Auto-commit if applicable (lock_name matches the script basename, e.g. "auto-commit-threads")
    if [ "$auto_commit" = "yes" ] && [ -n "$lock_name" ]; then
        local auto_commit_script="$SCRIPT_DIR/${lock_name}.sh"
        if [ -x "$auto_commit_script" ]; then
            log_verbose "$submodule_name: running auto-commit..."
            "$auto_commit_script" --skip-lock 2>&1 | while read -r line; do log_verbose "  $line"; done || true
        fi
    fi

    # Cross-submodule index contamination detector.
    # After auto-commit runs for import-history, check sibling submodules for
    # contamination (foreign entries in their index). Detects the condition where
    # import-history file paths appear in another submodule's git index -- objects
    # exist in import-history's store but not the target's, causing "invalid object"
    # errors on commit. Root cause is unidentified (GIT_DIR isolation fix deployed
    # Mar 2026 but contamination recurred Apr 2026 during active Claude sessions).
    if [ "$submodule_name" = "import-history" ]; then
        local base_ios_path="$USER_BASE_DIRECTORY/repository/active/base-ios"
        if [ -f "$base_ios_path/.git" ] || [ -d "$base_ios_path/.git" ]; then
            local foreign_count
            foreign_count=$(git -C "$base_ios_path" ls-files 2>/dev/null | grep -cE '^(github|notion|reddit|twitter)/' || true)
            if [ "$foreign_count" -gt 0 ]; then
                log_error "base-ios index contaminated with $foreign_count import-history entries (detected after import-history auto-commit)"
                log_telemetry "base-ios" "index_contamination" "entries:$foreign_count,trigger:post-import-history-autocommit,cwd:$(pwd),git_dir:${GIT_DIR:-unset},git_worktree:${GIT_WORK_TREE:-unset}"
                discord_notify_failure "base-ios" "index contamination detected: $foreign_count import-history entries after auto-commit"
                # Auto-repair: rebuild index from HEAD
                log "base-ios: repairing index via git read-tree HEAD..."
                if git -C "$base_ios_path" read-tree HEAD 2>/dev/null; then
                    log "base-ios: index repaired successfully"
                    log_telemetry "base-ios" "index_repaired" "entries_removed:$foreign_count"
                else
                    log_error "base-ios: git read-tree HEAD failed"
                fi
            fi
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

    # Skip network sync when storage is unreachable (auto-commit still ran above)
    if [ "$STORAGE_REACHABLE" != "true" ]; then
        log_verbose "$submodule_name: storage unreachable, skipping fetch/push"
        return 1
    fi

    # Delegate to unified sync function (submodules use rebase for diverged state)
    sync_repo "$full_path" "false"
}

# --- Storage connectivity pre-check ---
# Single quick SSH test before iterating submodules. Avoids ~10s timeout per repo
# when storage is unreachable (e.g., VPN flap, route loss). Auto-commit scripts
# still run so local commits aren't delayed.
STORAGE_REACHABLE=true
if ! ssh -o ConnectTimeout=3 -o BatchMode=yes storage true 2>/dev/null; then
    log_error "Storage server unreachable (SSH pre-check failed), skipping storage sync"
    log_telemetry "storage" "connectivity_failed" ""
    STORAGE_REACHABLE=false
    ERRORS=$((ERRORS + 1))
fi

# --- Step 1: Sync storage-hosted submodules ---

log_verbose "Step 1: Syncing storage-hosted submodules..."

for entry in "${STORAGE_SUBMODULES[@]}"; do
    IFS=':' read -r path auto_commit lock_name <<< "$entry"
    if ! sync_submodule "$path" "$auto_commit" "$lock_name"; then
        ERRORS=$((ERRORS + 1))
    fi

    # After thread git sync completes, push bulk data via rsync (non-fatal)
    if [ "$path" = "thread" ] && [ "$STORAGE_REACHABLE" = "true" ]; then
        if [ -x "$SCRIPT_DIR/sync-thread-data.sh" ]; then
            log_verbose "Pushing thread bulk data via rsync..."
            "$SCRIPT_DIR/sync-thread-data.sh" $([ "$VERBOSE" = true ] && echo "--verbose") || {
                log_error "sync-thread-data.sh failed (non-fatal)"
            }
        fi
    fi
done

# --- Step 1b: Sync GitHub-hosted active submodules ---
# Fetch from remote and fast-forward the local branch for each initialized
# repository/active/ submodule that is NOT storage-hosted. This keeps submodule
# working dirs up to date without detaching HEAD (unlike git submodule update).

log_verbose "Step 1b: Syncing GitHub-hosted active submodules..."

# Build delimited string of storage-hosted submodule paths for lookup
# (avoids declare -A which requires bash 4+; /bin/bash on macOS is 3.2)
_storage_submodule_paths="|"
for entry in "${STORAGE_SUBMODULES[@]}"; do
    IFS=':' read -r _path _ _ <<< "$entry"
    _storage_submodule_paths="${_storage_submodule_paths}${_path}|"
done

for sub_path in "$USER_BASE_DIRECTORY"/repository/active/*/; do
    [ -d "$sub_path" ] || continue
    # Skip if not initialized
    [ -d "$sub_path/.git" ] || [ -f "$sub_path/.git" ] || continue

    sub_name=$(basename "$sub_path")
    sub_rel_path="repository/active/$sub_name"

    # Skip storage-hosted submodules (handled in Step 1)
    case "$_storage_submodule_paths" in *"|$sub_rel_path|"*) continue ;; esac

    # Skip if not on a branch (detached HEAD = not actively developed, leave alone)
    current_branch=$(git -C "$sub_path" rev-parse --abbrev-ref HEAD 2>/dev/null) || continue
    if [ "$current_branch" = "HEAD" ]; then
        log_verbose "$sub_name: detached HEAD, skipping"
        continue
    fi

    # Skip if dirty
    if ! git -C "$sub_path" diff --quiet --ignore-submodules 2>/dev/null || \
       ! git -C "$sub_path" diff --cached --quiet --ignore-submodules 2>/dev/null; then
        log_verbose "$sub_name: dirty, skipping"
        continue
    fi

    # Skip if merge/rebase in progress
    if ! check_git_state "$sub_path"; then
        continue
    fi

    # Fetch from remote
    if ! git -C "$sub_path" fetch origin 2>/dev/null; then
        log_verbose "$sub_name: fetch failed, skipping"
        continue
    fi

    remote_branch="origin/$current_branch"
    if ! git -C "$sub_path" rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
        continue
    fi

    local_commit=$(git -C "$sub_path" rev-parse HEAD)
    remote_commit=$(git -C "$sub_path" rev-parse "$remote_branch")

    if [ "$local_commit" = "$remote_commit" ]; then
        log_verbose "$sub_name: up to date"
    elif [ "$(git -C "$sub_path" merge-base HEAD "$remote_branch")" = "$local_commit" ]; then
        # Behind remote - fast-forward
        log "$sub_name: behind remote, fast-forwarding..."
        if git -C "$sub_path" merge --ff-only "$remote_branch" 2>/dev/null; then
            log_verbose "$sub_name: fast-forwarded"
        else
            log_verbose "$sub_name: fast-forward failed, skipping"
        fi
    else
        log_verbose "$sub_name: ahead or diverged, skipping"
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
    # Throttle: skip if last pointer commit was less than 5 minutes ago to reduce
    # parent repo churn (983 of 2,218 commits are pointer updates).
    POINTER_THROTTLE_MARKER="/tmp/sync-pointer-commit.marker"
    POINTER_THROTTLED=false
    if [ -f "$POINTER_THROTTLE_MARKER" ]; then
        last_pointer=$(cat "$POINTER_THROTTLE_MARKER" 2>/dev/null) || true
        if [ -n "$last_pointer" ]; then
            now_epoch=$(date +%s)
            elapsed=$(( now_epoch - last_pointer ))
            if [ $elapsed -lt 300 ]; then
                POINTER_THROTTLED=true
                log_verbose "Pointer commit throttled (${elapsed}s since last, min 300s)"
            fi
        fi
    fi

    if [ "$PARENT_IS_DIRTY" = false ] && [ "$POINTER_THROTTLED" = false ]; then
        POINTER_UPDATED=false
        UPDATED_SUBMODULES=()

        # Check all initialized submodules for pointer drift (storage-hosted and GitHub-hosted)
        for submodule_path in $(git config --file .gitmodules --get-regexp 'submodule\..*\.path' 2>/dev/null | awk '{print $2}'); do
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
            # Update throttle marker after successful pointer commit
            date +%s > "$POINTER_THROTTLE_MARKER"
            log_telemetry "user-base" "pointer_commit" "submodules:${UPDATED_SUBMODULES[*]}"
        else
            log_verbose "All submodule pointers are current"
        fi
    elif [ "$PARENT_IS_DIRTY" = true ]; then
        log_verbose "Parent dirty, skipping pointer detection"
    fi

    # Sync parent repo (uses merge for diverged state)
    if [ "$STORAGE_REACHABLE" = "true" ]; then
        if ! sync_repo "$USER_BASE_DIRECTORY" "true"; then
            ERRORS=$((ERRORS + 1))
        fi
    else
        log_verbose "Skipping parent repo sync (storage unreachable)"
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
