#!/bin/bash

# sync-all.sh - Unified sync orchestrator for all storage-hosted submodules and parent repo
#
# Replaces individual push/pull scheduled commands with a single orchestration script.
# Syncs in correct dependency order: submodules -> pointers -> parent.
#
# Usage:
#   sync-all.sh [--verbose]
#
# Called by:
#   - Post-commit hooks (event-driven, backgrounded)
#   - Scheduled command every 30s (fallback)
#
# Behavior:
#   1. Acquires global lock to prevent concurrent orchestrator runs
#   2. Syncs each storage-hosted submodule (auto-commit if applicable, fetch, rebase, push)
#   3. Fetches parent, rebases if behind, then updates storage-hosted submodule pointers
#   4. Syncs parent repo (fetch, overlap-check pull, push)
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
)

# --- Helper Functions ---

# Check if a submodule is initialized
is_submodule_initialized() {
    local submodule_path="$1"
    local full_path="$USER_BASE_DIRECTORY/$submodule_path"
    [ -d "$full_path/.git" ] || [ -f "$full_path/.git" ]
}

# Check if dirty files overlap with incoming changes from a remote branch.
# Returns 0 if there IS overlap (unsafe), 1 if no overlap (safe to rebase).
# Sets OVERLAP_FILES variable with the overlapping files when overlap exists.
# Args: $1 = directory, $2 = merge_base, $3 = remote_branch
check_dirty_overlap() {
    local dir="$1"
    local merge_base="$2"
    local remote_branch="$3"

    local dirty_files incoming_files overlap
    dirty_files=$({ git -C "$dir" diff --name-only --ignore-submodules 2>/dev/null; git -C "$dir" diff --cached --name-only --ignore-submodules 2>/dev/null; } | sort -u)
    incoming_files=$(git -C "$dir" diff --name-only "$merge_base".."$remote_branch" --ignore-submodules 2>/dev/null | sort -u)
    overlap=$(comm -12 <(echo "$dirty_files") <(echo "$incoming_files"))

    if [ -n "$overlap" ]; then
        OVERLAP_FILES="$overlap"
        return 0
    fi
    return 1
}

# Check for merge/rebase in progress
check_git_state() {
    local dir="$1"
    local git_dir
    git_dir=$(git -C "$dir" rev-parse --git-dir 2>/dev/null) || return 1

    if [ -f "$git_dir/MERGE_HEAD" ]; then
        log_error "$dir: merge in progress, skipping"
        return 1
    fi
    if [ -d "$git_dir/rebase-merge" ] || [ -d "$git_dir/rebase-apply" ]; then
        log_error "$dir: rebase in progress, skipping"
        return 1
    fi
    return 0
}

# Check if a commit only changes submodule pointers (mode 160000).
# Returns 0 if pointer-only, 1 if it has any non-submodule changes.
# Uses -c diff.ignoreSubmodules=none to ensure submodules with ignore=all
# in .gitmodules are still visible to diff-tree.
# Args: $1 = commit SHA
is_pointer_only_commit() {
    local sha="$1"
    local changes
    changes=$(git -c diff.ignoreSubmodules=none diff-tree --no-commit-id -r "$sha" 2>/dev/null)
    [ -z "$changes" ] && return 0
    # Any entry without submodule mode (160000) means non-pointer content
    if echo "$changes" | grep -qv '^:160000 160000 '; then
        return 1
    fi
    return 0
}

# Rebase with pointer-only commit skipping and submodule conflict auto-resolution.
# Phase 1: Drops local pointer-only commits via interactive rebase sequence editor.
#           These commits are redundant since the remote has equivalent pointer state,
#           and they're the primary source of submodule pointer conflicts.
# Phase 2: Auto-resolves submodule pointer conflicts (mode 160000) by staging the
#           current submodule HEAD, which is correct because Step 1 already synced it.
# Returns 0 on success, 1 on unresolvable conflict or error.
# Args: $1 = remote_branch
smart_rebase() {
    local remote_branch="$1"
    local merge_base
    merge_base=$(git merge-base HEAD "$remote_branch" 2>/dev/null) || return 1

    # Phase 1: Identify pointer-only local commits to drop
    local pointer_only_shas=()
    local total_local=0
    for sha in $(git rev-list "$merge_base"..HEAD); do
        total_local=$((total_local + 1))
        if is_pointer_only_commit "$sha"; then
            pointer_only_shas+=("$sha")
        fi
    done

    local dropping=${#pointer_only_shas[@]}
    if [ $dropping -gt 0 ]; then
        log "Dropping $dropping of $total_local pointer-only commit(s) during rebase"
    fi

    # Run rebase with sequence editor to drop pointer-only commits
    local rebase_status
    if [ $dropping -gt 0 ]; then
        local drop_file
        drop_file=$(mktemp /tmp/sync-rebase-drops.XXXXXX)
        for sha in "${pointer_only_shas[@]}"; do
            echo "${sha:0:7}" >> "$drop_file"
        done

        GIT_SEQUENCE_EDITOR="awk -v df='$drop_file' 'BEGIN{while((getline l<df)>0)d[l]=1} {if(\$1==\"pick\"&&(substr(\$2,1,7) in d))\$1=\"drop\"} 1'" \
            git -c diff.ignoreSubmodules=none rebase -i --autostash --no-autosquash "$remote_branch" 2>/dev/null
        rebase_status=$?
        rm -f "$drop_file"
    else
        git -c diff.ignoreSubmodules=none rebase --autostash "$remote_branch" 2>/dev/null
        rebase_status=$?
    fi

    # Phase 2: Auto-resolve submodule pointer conflicts
    local max_retries=20
    local retries=0
    while [ $rebase_status -ne 0 ] && [ $retries -lt $max_retries ]; do
        local unmerged
        unmerged=$(git ls-files -u 2>/dev/null)
        if [ -z "$unmerged" ]; then
            # Rebase failed but no unmerged files - unknown error
            git rebase --abort 2>/dev/null || true
            return 1
        fi

        # Check if ALL unmerged entries are submodules (mode 160000)
        local has_file_conflict
        has_file_conflict=$(echo "$unmerged" | awk '$1 != "160000"' | head -1)
        if [ -n "$has_file_conflict" ]; then
            # Non-submodule conflict - cannot auto-resolve
            git rebase --abort 2>/dev/null || true
            return 1
        fi

        # All conflicts are submodule pointers - resolve with current HEAD
        local conflict_paths
        conflict_paths=$(echo "$unmerged" | awk '{print $4}' | sort -u)
        while IFS= read -r conflict_path; do
            git add "$conflict_path" 2>/dev/null
            log_verbose "Auto-resolved submodule conflict: $conflict_path"
        done <<< "$conflict_paths"

        GIT_EDITOR=true git -c diff.ignoreSubmodules=none rebase --continue 2>/dev/null
        rebase_status=$?
        retries=$((retries + 1))
    done

    if [ $rebase_status -ne 0 ]; then
        git rebase --abort 2>/dev/null || true
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

# Sync a single submodule: fetch -> divergence check -> rebase/push
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
        current_branch="main"
    fi

    # Fetch
    if ! git -C "$full_path" fetch origin 2>/dev/null; then
        log_error "$submodule_name: fetch failed"
        return 1
    fi

    local remote_branch="origin/$current_branch"

    # Check if remote branch exists
    if ! git -C "$full_path" rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
        log_verbose "$submodule_name: no remote branch, pushing..."
        git -C "$full_path" push -u origin "$current_branch" 2>/dev/null || {
            log_error "$submodule_name: push failed"
            return 1
        }
        return 0
    fi

    local local_commit remote_commit merge_base
    local_commit=$(git -C "$full_path" rev-parse HEAD)
    remote_commit=$(git -C "$full_path" rev-parse "$remote_branch")
    merge_base=$(git -C "$full_path" merge-base HEAD "$remote_branch")

    if [ "$local_commit" = "$remote_commit" ]; then
        log_verbose "$submodule_name: up to date"
        return 0
    elif [ "$local_commit" = "$merge_base" ]; then
        # Behind remote - rebase
        log "$submodule_name: behind remote, rebasing..."
        if ! git -C "$full_path" rebase --autostash "$remote_branch" 2>/dev/null; then
            git -C "$full_path" rebase --abort 2>/dev/null || true
            log_error "$submodule_name: rebase failed"
            "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
                --title "Sync failed: $submodule_name" \
                --message "sync-all: rebase failed on $(hostname), manual intervention required" 2>/dev/null || true
            return 1
        fi
        log "$submodule_name: rebased successfully"

        # Check if we now have local commits to push
        local new_local new_remote
        new_local=$(git -C "$full_path" rev-parse HEAD)
        new_remote=$(git -C "$full_path" rev-parse "$remote_branch")
        if [ "$new_local" != "$new_remote" ]; then
            log "$submodule_name: pushing local commits..."
            git -C "$full_path" push origin "$current_branch" 2>/dev/null || {
                log_error "$submodule_name: push failed after rebase"
                return 1
            }
        fi
    elif [ "$remote_commit" = "$merge_base" ]; then
        # Ahead of remote - push with retry on ref contention
        log "$submodule_name: ahead of remote, pushing..."
        if ! git -C "$full_path" push origin "$current_branch" 2>/dev/null; then
            # Push failed - likely cross-machine race (remote ref changed between
            # fetch and push). Re-fetch and re-evaluate divergence state once.
            log "$submodule_name: push failed, re-fetching and retrying..."
            if ! git -C "$full_path" fetch origin 2>/dev/null; then
                log_error "$submodule_name: re-fetch failed"
                return 1
            fi
            local retry_remote retry_local retry_base
            retry_remote=$(git -C "$full_path" rev-parse "$remote_branch")
            retry_local=$(git -C "$full_path" rev-parse HEAD)
            retry_base=$(git -C "$full_path" merge-base HEAD "$remote_branch")
            if [ "$retry_local" = "$retry_remote" ]; then
                log "$submodule_name: already up to date after re-fetch"
            elif [ "$retry_local" = "$retry_base" ]; then
                log "$submodule_name: now behind remote, rebasing..."
                if ! git -C "$full_path" rebase --autostash "$remote_branch" 2>/dev/null; then
                    git -C "$full_path" rebase --abort 2>/dev/null || true
                    log_error "$submodule_name: rebase failed on retry"
                    return 1
                fi
                # Push if we have local commits after rebase
                local retry_new_local retry_new_remote
                retry_new_local=$(git -C "$full_path" rev-parse HEAD)
                retry_new_remote=$(git -C "$full_path" rev-parse "$remote_branch")
                if [ "$retry_new_local" != "$retry_new_remote" ]; then
                    git -C "$full_path" push origin "$current_branch" 2>/dev/null || {
                        log_error "$submodule_name: push failed on retry"
                        return 1
                    }
                fi
            elif [ "$retry_remote" = "$retry_base" ]; then
                git -C "$full_path" push origin "$current_branch" 2>/dev/null || {
                    log_error "$submodule_name: push failed on retry"
                    return 1
                }
            else
                log "$submodule_name: diverged on retry, rebasing..."
                if ! git -C "$full_path" rebase --autostash "$remote_branch" 2>/dev/null; then
                    git -C "$full_path" rebase --abort 2>/dev/null || true
                    log_error "$submodule_name: rebase failed on retry (diverged)"
                    return 1
                fi
                git -C "$full_path" push origin "$current_branch" 2>/dev/null || {
                    log_error "$submodule_name: push failed on retry after rebase"
                    return 1
                }
            fi
            log "$submodule_name: retry succeeded"
        else
            log "$submodule_name: pushed successfully"
        fi
    else
        # Diverged - rebase then push
        log "$submodule_name: diverged, rebasing..."
        if ! git -C "$full_path" rebase --autostash "$remote_branch" 2>/dev/null; then
            git -C "$full_path" rebase --abort 2>/dev/null || true
            log_error "$submodule_name: rebase failed (diverged)"
            "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
                --title "Sync failed: $submodule_name" \
                --message "sync-all: rebase failed (diverged) on $(hostname), manual intervention required" 2>/dev/null || true
            return 1
        fi
        log "$submodule_name: rebased, pushing..."
        git -C "$full_path" push origin "$current_branch" 2>/dev/null || {
            log_error "$submodule_name: push failed after rebase"
            return 1
        }
        log "$submodule_name: pushed successfully"
    fi

    return 0
}

# --- Step 1: Sync storage-hosted submodules ---

log_verbose "Step 1: Syncing storage-hosted submodules..."

for entry in "${STORAGE_SUBMODULES[@]}"; do
    IFS=':' read -r path auto_commit lock_name <<< "$entry"
    if ! sync_submodule "$path" "$auto_commit" "$lock_name"; then
        ERRORS=$((ERRORS + 1))
    fi
done

# --- Step 2: Update submodule pointers for storage-hosted submodules ---

log_verbose "Step 2: Checking submodule pointers..."

cd "$USER_BASE_DIRECTORY"

# Fetch parent repo first to pull in any pointer commits from the other machine.
# This prevents duplicate "chore: update submodule pointers" commits when both
# machines detect the same pointer drift.
if check_git_state "$USER_BASE_DIRECTORY"; then
    if git fetch origin 2>/dev/null; then
        STEP2_BRANCH=$(git rev-parse --abbrev-ref HEAD)
        STEP2_REMOTE="origin/$STEP2_BRANCH"
        if git rev-parse --verify "$STEP2_REMOTE" >/dev/null 2>&1; then
            STEP2_LOCAL=$(git rev-parse HEAD)
            STEP2_REMOTE_COMMIT=$(git rev-parse "$STEP2_REMOTE")
            STEP2_MERGE_BASE=$(git merge-base HEAD "$STEP2_REMOTE")

            if [ "$STEP2_LOCAL" = "$STEP2_MERGE_BASE" ] && [ "$STEP2_LOCAL" != "$STEP2_REMOTE_COMMIT" ]; then
                # Strictly behind - rebase to pull in remote pointer commits
                if ! git diff --quiet --ignore-submodules || ! git diff --cached --quiet --ignore-submodules; then
                    if check_dirty_overlap "$USER_BASE_DIRECTORY" "$STEP2_MERGE_BASE" "$STEP2_REMOTE"; then
                        log "Pre-pointer fetch: behind but dirty files overlap, skipping rebase"
                    else
                        log "Pre-pointer fetch: behind with no overlap, rebasing..."
                        if ! git rebase --autostash "$STEP2_REMOTE" 2>/dev/null; then
                            git rebase --abort 2>/dev/null || true
                            log_error "Pre-pointer fetch: rebase failed"
                            ERRORS=$((ERRORS + 1))
                        else
                            log "Pre-pointer fetch: rebased successfully"
                            git submodule update --init repository/active/base 2>/dev/null || true
                        fi
                    fi
                else
                    log "Pre-pointer fetch: behind remote, rebasing..."
                    if ! git rebase --autostash "$STEP2_REMOTE" 2>/dev/null; then
                        git rebase --abort 2>/dev/null || true
                        log_error "Pre-pointer fetch: rebase failed"
                        ERRORS=$((ERRORS + 1))
                    else
                        log "Pre-pointer fetch: rebased successfully"
                        git submodule update --init repository/active/base 2>/dev/null || true
                    fi
                fi
            else
                log_verbose "Pre-pointer fetch: not strictly behind, skipping rebase"
            fi
        fi
    else
        log_verbose "Pre-pointer fetch: fetch failed, continuing with local state"
    fi
fi

POINTER_UPDATED=false
UPDATED_SUBMODULES=()

# Only update pointers for storage-hosted submodules (synced by Step 1).
# GitHub-hosted submodules are pulled independently on each machine, so tracking
# their pointers here would create duplicate commits when both machines pull the
# same upstream changes at slightly different times.
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
    # POINTER_UPDATED guarantees at least one submodule was staged via git add.
    # Note: git diff --cached --quiet cannot be used here because submodules with
    # ignore=all in .gitmodules are invisible to git diff --cached, even when staged.

    # Throttle: if HEAD is an unpushed pointer-only commit, amend it instead of
    # creating a new one. This keeps at most 1 unpushed pointer commit at any time,
    # reducing divergence risk when both machines create pointer commits simultaneously.
    can_amend=false
    current_branch_name=$(git rev-parse --abbrev-ref HEAD)
    head_sha=$(git rev-parse HEAD)
    remote_sha=$(git rev-parse "origin/$current_branch_name" 2>/dev/null) || true
    if [ -n "$remote_sha" ]; then
        ptr_merge_base=$(git merge-base HEAD "origin/$current_branch_name" 2>/dev/null) || true
        # HEAD must be strictly ahead of remote (unpushed commits exist)
        if [ "$ptr_merge_base" = "$remote_sha" ] && [ "$head_sha" != "$remote_sha" ]; then
            if is_pointer_only_commit HEAD; then
                can_amend=true
            fi
        fi
    fi

    if [ "$can_amend" = true ]; then
        log "Amending previous pointer commit with: ${UPDATED_SUBMODULES[*]}"
        git commit --amend --no-edit 2>/dev/null || {
            log_error "Failed to amend submodule pointer commit"
            ERRORS=$((ERRORS + 1))
        }
    else
        log "Committing pointer updates for: ${UPDATED_SUBMODULES[*]}"
        git commit -m "chore: update submodule pointers" 2>/dev/null || {
            log_error "Failed to commit submodule pointer updates"
            ERRORS=$((ERRORS + 1))
        }
    fi
    log "Submodule pointers committed"
else
    log_verbose "All submodule pointers are current"
fi

# --- Step 3: Sync parent repo (user-base) ---

log_verbose "Step 3: Syncing parent repo..."

cd "$USER_BASE_DIRECTORY"

if ! check_git_state "$USER_BASE_DIRECTORY"; then
    log_error "Parent repo has git operation in progress, skipping"
    ERRORS=$((ERRORS + 1))
else
    # Fetch
    if ! git fetch origin 2>/dev/null; then
        log_error "Parent: fetch failed"
        ERRORS=$((ERRORS + 1))
    else
        CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
        REMOTE_BRANCH="origin/$CURRENT_BRANCH"

        if git rev-parse --verify "$REMOTE_BRANCH" >/dev/null 2>&1; then
            LOCAL_COMMIT=$(git rev-parse HEAD)
            REMOTE_COMMIT=$(git rev-parse "$REMOTE_BRANCH")
            MERGE_BASE=$(git merge-base HEAD "$REMOTE_BRANCH")

            if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
                log_verbose "Parent: up to date"
            elif [ "$LOCAL_COMMIT" = "$MERGE_BASE" ]; then
                # Behind remote - check for dirty state
                if ! git diff --quiet --ignore-submodules || ! git diff --cached --quiet --ignore-submodules; then
                    if check_dirty_overlap "$USER_BASE_DIRECTORY" "$MERGE_BASE" "$REMOTE_BRANCH"; then
                        log_error "Parent: overlap detected between dirty files and incoming changes:"
                        echo "$OVERLAP_FILES" | while read -r f; do log_error "  $f"; done
                        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity warning \
                            --title "Sync blocked: file overlap" \
                            --message "sync-all on $(hostname): dirty files overlap with incoming changes. Files: $(echo "$OVERLAP_FILES" | tr '\n' ', ')" 2>/dev/null || true
                        ERRORS=$((ERRORS + 1))
                    else
                        log "Parent: dirty but no overlap, rebasing..."
                        if ! git rebase --autostash "$REMOTE_BRANCH" 2>/dev/null; then
                            git rebase --abort 2>/dev/null || true
                            log_error "Parent: rebase failed"
                            "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
                                --title "User-base sync failed" \
                                --message "sync-all: rebase failed on $(hostname), manual intervention required" 2>/dev/null || true
                            ERRORS=$((ERRORS + 1))
                        else
                            log "Parent: rebased successfully"
                        fi
                    fi
                else
                    # Clean working directory (ignoring submodules) - use autostash
                    # since dirty submodule pointers may still block plain rebase
                    log "Parent: behind remote, rebasing..."
                    if ! git rebase --autostash "$REMOTE_BRANCH" 2>/dev/null; then
                        git rebase --abort 2>/dev/null || true
                        log_error "Parent: rebase failed"
                        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
                            --title "User-base sync failed" \
                            --message "sync-all: rebase failed on $(hostname), manual intervention required" 2>/dev/null || true
                        ERRORS=$((ERRORS + 1))
                    else
                        log "Parent: rebased successfully"
                        # Update base submodule after pull
                        git submodule update --init repository/active/base 2>/dev/null || true
                    fi
                fi
            elif [ "$REMOTE_COMMIT" = "$MERGE_BASE" ]; then
                # Ahead of remote - push with retry on ref contention
                log "Parent: ahead of remote, pushing..."
                if ! git push origin "$CURRENT_BRANCH" 2>/dev/null; then
                    # Push failed - likely cross-machine race. Re-fetch and retry once.
                    log "Parent: push failed, re-fetching and retrying..."
                    if git fetch origin 2>/dev/null; then
                        RETRY_REMOTE=$(git rev-parse "$REMOTE_BRANCH")
                        RETRY_LOCAL=$(git rev-parse HEAD)
                        RETRY_BASE=$(git merge-base HEAD "$REMOTE_BRANCH")
                        if [ "$RETRY_LOCAL" = "$RETRY_REMOTE" ]; then
                            log "Parent: already up to date after re-fetch"
                        elif [ "$RETRY_REMOTE" = "$RETRY_BASE" ]; then
                            git push origin "$CURRENT_BRANCH" 2>/dev/null || {
                                log_error "Parent: push failed on retry"
                                ERRORS=$((ERRORS + 1))
                            }
                        elif [ "$RETRY_LOCAL" = "$RETRY_BASE" ]; then
                            log "Parent: now behind remote after re-fetch, rebasing..."
                            if ! git rebase --autostash "$REMOTE_BRANCH" 2>/dev/null; then
                                git rebase --abort 2>/dev/null || true
                                log_error "Parent: rebase failed on retry"
                                ERRORS=$((ERRORS + 1))
                            else
                                git submodule update --init repository/active/base 2>/dev/null || true
                                # Push if we have local commits after rebase
                                if [ "$(git rev-parse HEAD)" != "$(git rev-parse "$REMOTE_BRANCH")" ]; then
                                    git push origin "$CURRENT_BRANCH" 2>/dev/null || {
                                        log_error "Parent: push failed on retry after rebase"
                                        ERRORS=$((ERRORS + 1))
                                    }
                                fi
                            fi
                        else
                            log "Parent: diverged on retry, smart rebasing..."
                            if ! smart_rebase "$REMOTE_BRANCH"; then
                                log_error "Parent: smart rebase failed on retry"
                                ERRORS=$((ERRORS + 1))
                            else
                                git push origin "$CURRENT_BRANCH" 2>/dev/null || {
                                    log_error "Parent: push failed on retry after rebase"
                                    ERRORS=$((ERRORS + 1))
                                }
                            fi
                        fi
                    else
                        log_error "Parent: re-fetch failed"
                        ERRORS=$((ERRORS + 1))
                    fi
                fi
            else
                # Diverged
                if ! git diff --quiet --ignore-submodules || ! git diff --cached --quiet --ignore-submodules; then
                    if check_dirty_overlap "$USER_BASE_DIRECTORY" "$MERGE_BASE" "$REMOTE_BRANCH"; then
                        log_error "Parent: diverged with overlapping dirty files, skipping sync:"
                        echo "$OVERLAP_FILES" | while read -r f; do log_error "  $f"; done
                        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity warning \
                            --title "Sync blocked: diverged with overlap" \
                            --message "sync-all on $(hostname): diverged and dirty files overlap with incoming changes. Files: $(echo "$OVERLAP_FILES" | tr '\n' ', ')" 2>/dev/null || true
                        ERRORS=$((ERRORS + 1))
                    else
                        log "Parent: diverged and dirty but no overlap, smart rebasing..."
                        if ! smart_rebase "$REMOTE_BRANCH"; then
                            log_error "Parent: smart rebase failed (diverged+dirty)"
                            "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
                                --title "User-base sync failed" \
                                --message "sync-all: rebase failed (diverged) on $(hostname), manual intervention required" 2>/dev/null || true
                            ERRORS=$((ERRORS + 1))
                        else
                            log "Parent: rebased, pushing..."
                            git push origin "$CURRENT_BRANCH" 2>/dev/null || {
                                log_error "Parent: push failed after rebase"
                                ERRORS=$((ERRORS + 1))
                            }
                        fi
                    fi
                else
                    log "Parent: diverged, smart rebasing..."
                    if ! smart_rebase "$REMOTE_BRANCH"; then
                        log_error "Parent: smart rebase failed (diverged)"
                        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
                            --title "User-base sync failed" \
                            --message "sync-all: rebase failed (diverged) on $(hostname), manual intervention required" 2>/dev/null || true
                        ERRORS=$((ERRORS + 1))
                    else
                        log "Parent: rebased, pushing..."
                        git push origin "$CURRENT_BRANCH" 2>/dev/null || {
                            log_error "Parent: push failed after rebase"
                            ERRORS=$((ERRORS + 1))
                        }
                    fi
                fi
            fi
        fi
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
