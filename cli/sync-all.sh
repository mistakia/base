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
#   3. Updates submodule pointers for ALL active submodules in the parent repo
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

    log_verbose "Syncing $submodule_name..."

    # Auto-commit if applicable
    if [ "$auto_commit" = "yes" ]; then
        local auto_commit_script="$SCRIPT_DIR/auto-commit-${submodule_name}.sh"
        if [ -x "$auto_commit_script" ]; then
            log_verbose "$submodule_name: running auto-commit..."
            "$auto_commit_script" --skip-lock 2>&1 | while read -r line; do log_verbose "  $line"; done || true
        fi
    fi

    # Fetch
    if ! git -C "$full_path" fetch origin 2>/dev/null; then
        log_error "$submodule_name: fetch failed"
        return 1
    fi

    local current_branch
    current_branch=$(git -C "$full_path" rev-parse --abbrev-ref HEAD)
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
        if ! git -C "$full_path" rebase "$remote_branch" 2>/dev/null; then
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
        # Ahead of remote - push
        log "$submodule_name: ahead of remote, pushing..."
        git -C "$full_path" push origin "$current_branch" 2>/dev/null || {
            log_error "$submodule_name: push failed"
            return 1
        }
        log "$submodule_name: pushed successfully"
    else
        # Diverged - rebase then push
        log "$submodule_name: diverged, rebasing..."
        if ! git -C "$full_path" rebase "$remote_branch" 2>/dev/null; then
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

# --- Step 2: Update submodule pointers for all active submodules ---

log_verbose "Step 2: Checking submodule pointers..."

cd "$USER_BASE_DIRECTORY"

POINTER_UPDATED=false

# Get list of all submodules from .gitmodules
while IFS= read -r submodule_path; do
    if [ -z "$submodule_path" ]; then
        continue
    fi

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
    fi
done < <(git config --file .gitmodules --get-regexp '\.path$' | awk '{print $2}')

if [ "$POINTER_UPDATED" = true ]; then
    # Check for staged changes before committing
    if ! git diff --cached --quiet; then
        git commit -m "chore: update submodule pointers" 2>/dev/null || {
            log_error "Failed to commit submodule pointer updates"
            ERRORS=$((ERRORS + 1))
        }
        log "Submodule pointers committed"
    fi
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
                    # Dirty working directory - compute overlap
                    dirty_files=$({ git diff --name-only --ignore-submodules 2>/dev/null; git diff --cached --name-only --ignore-submodules 2>/dev/null; } | sort -u)
                    incoming_files=$(git diff --name-only "$MERGE_BASE".."$REMOTE_BRANCH" --ignore-submodules 2>/dev/null | sort -u)
                    overlap=$(comm -12 <(echo "$dirty_files") <(echo "$incoming_files"))

                    if [ -n "$overlap" ]; then
                        log_error "Parent: overlap detected between dirty files and incoming changes:"
                        echo "$overlap" | while read -r f; do log_error "  $f"; done
                        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity warning \
                            --title "Sync blocked: file overlap" \
                            --message "sync-all on $(hostname): dirty files overlap with incoming changes. Files: $(echo "$overlap" | tr '\n' ', ')" 2>/dev/null || true
                        ERRORS=$((ERRORS + 1))
                    else
                        log "Parent: dirty but no overlap, rebasing..."
                        if ! git rebase "$REMOTE_BRANCH" 2>/dev/null; then
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
                    # Clean working directory - safe to rebase
                    log "Parent: behind remote, rebasing..."
                    if ! git rebase "$REMOTE_BRANCH" 2>/dev/null; then
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
                # Ahead of remote
                if ! git diff --quiet --ignore-submodules || ! git diff --cached --quiet --ignore-submodules; then
                    log_verbose "Parent: ahead but dirty, skipping push"
                else
                    log "Parent: ahead of remote, pushing..."
                    git push origin "$CURRENT_BRANCH" 2>/dev/null || {
                        log_error "Parent: push failed"
                        ERRORS=$((ERRORS + 1))
                    }
                fi
            else
                # Diverged
                if ! git diff --quiet --ignore-submodules || ! git diff --cached --quiet --ignore-submodules; then
                    log "Parent: diverged and dirty, skipping sync"
                else
                    log "Parent: diverged, rebasing..."
                    if ! git rebase "$REMOTE_BRANCH" 2>/dev/null; then
                        git rebase --abort 2>/dev/null || true
                        log_error "Parent: rebase failed (diverged)"
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
