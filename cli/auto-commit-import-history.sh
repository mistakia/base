#!/bin/bash

# Auto-commit import-history files to git
# This script stages and commits import-history files within the import-history submodule
# Called by push-import-history.sh before pushing
#
# Usage:
#   auto-commit-import-history.sh [--skip-lock]
#
# Options:
#   --skip-lock   Skip lock acquisition (caller already holds lock)
#
# Behavior:
# - Operates within the import-history/ submodule (separate git repo)
# - Stages all untracked and modified files
# - Creates a normal commit (not amend) for dual-machine compatibility
# - Uses file locking to prevent concurrent execution
# - Non-blocking: exits immediately if lock held (scheduled job will handle)

set -e

# Parse arguments
SKIP_LOCK=false
for arg in "$@"; do
    case "$arg" in
        --skip-lock) SKIP_LOCK=true ;;
    esac
done

# Locking configuration
LOCKFILE="/tmp/auto-commit-import-history.lock"

# Require USER_BASE_DIRECTORY to be set
source "$(dirname "$0")/lib/paths.sh"

if [ ! -d "$IMPORT_HISTORY_DIR/.git" ] && [ ! -f "$IMPORT_HISTORY_DIR/.git" ]; then
    echo "Import-history submodule not initialized at $IMPORT_HISTORY_DIR" >&2
    exit 0
fi

cd "$IMPORT_HISTORY_DIR"

# Enforce working tree boundary to prevent cross-submodule contamination.
# Without this, detached HEAD or misconfigured core.worktree can cause git to
# resolve the working tree to the parent user-base directory, staging files
# from sibling submodules (e.g., thread's UUID dirs).
export GIT_WORK_TREE="$IMPORT_HISTORY_DIR"

# Safety checks
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Not in a git repository" >&2
    exit 0
fi

# Check for merge conflicts
if [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
    echo "Merge in progress, skipping auto-commit" >&2
    exit 0
fi

# Check for rebase in progress
GIT_DIR=$(git rev-parse --git-dir)
if [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
    echo "Rebase in progress, skipping auto-commit" >&2
    exit 0
fi

# Try to acquire lock (non-blocking, single attempt with stale lock recovery)
# Returns 0 if acquired, 1 if held by another process
try_acquire_lock() {
    # Try to acquire lock atomically
    if ( set -o noclobber; echo $$ > "$LOCKFILE" ) 2>/dev/null; then
        # Lock acquired, set trap to release on exit
        trap 'rm -f "$LOCKFILE"' EXIT INT TERM
        return 0
    fi

    # Lock file exists - check if holder is still alive
    if [ -f "$LOCKFILE" ]; then
        local lock_pid
        lock_pid=$(cat "$LOCKFILE" 2>/dev/null) || return 1

        if [ -n "$lock_pid" ] && ! kill -0 "$lock_pid" 2>/dev/null; then
            # Lock holder is dead - safe to remove and retry once
            echo "Removing stale lock from dead PID $lock_pid"
            rm -f "$LOCKFILE"
            # Retry acquisition once after stale lock removal
            if ( set -o noclobber; echo $$ > "$LOCKFILE" ) 2>/dev/null; then
                trap 'rm -f "$LOCKFILE"' EXIT INT TERM
                return 0
            fi
            return 1
        fi
    fi

    return 1
}

# Acquire lock if not skipped
if [ "$SKIP_LOCK" = false ]; then
    if ! try_acquire_lock; then
        echo "Lock held by another process, skipping (scheduled job will handle)"
        exit 0
    fi
fi

# Perform git operations
do_commit() {
    # Stage untracked files
    untracked_files=$(git ls-files --others --exclude-standard 2>/dev/null || true)

    if [ -n "$untracked_files" ]; then
        echo "Staging untracked import-history files..."
        echo "$untracked_files" | xargs git add
    fi

    # Stage modified files
    modified_files=$(git diff --name-only 2>/dev/null || true)

    if [ -n "$modified_files" ]; then
        echo "Staging modified import-history files..."
        echo "$modified_files" | xargs git add
    fi

    # Check if there are any staged changes
    if git diff --cached --quiet; then
        echo "No import-history files to commit"
        exit 0
    fi

    # Show what will be committed
    echo "Files staged for commit:"
    git diff --cached --name-only

    # Create commit
    echo "Committing import-history files..."
    git commit -m "import-history: batch sync $(date +%Y%m%d-%H%M%S)"

    echo "Import-history files committed successfully"
}

do_commit
