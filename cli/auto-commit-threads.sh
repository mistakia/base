#!/bin/bash

# Auto-commit thread files to git
# This script stages and commits thread files within the thread submodule
# Called by Claude Code sync-claude-session.sh hook or push-threads.sh
#
# Usage:
#   auto-commit-threads.sh [--skip-lock] [thread_id]
#
# Options:
#   --skip-lock   Skip lock acquisition (caller already holds lock)
#
# Behavior:
# - Operates within the thread/ submodule (separate git repo)
# - If thread_id provided: stages entire thread folder (all files)
# - If no thread_id: stages matching patterns for batch commits
# - Creates a normal commit (not amend) for dual-machine compatibility
# - Uses file locking to prevent concurrent execution
# - Non-blocking: exits immediately if lock held (scheduled job will handle)

set -e

# Parse arguments
SKIP_LOCK=false
THREAD_ID=""
for arg in "$@"; do
    case "$arg" in
        --skip-lock) SKIP_LOCK=true ;;
        *) THREAD_ID="$arg" ;;
    esac
done

# Locking configuration
LOCKFILE="/tmp/auto-commit-threads.lock"

# Require USER_BASE_DIRECTORY to be set
source "$(dirname "$0")/lib/paths.sh"

if [ ! -d "$THREAD_DIR/.git" ] && [ ! -f "$THREAD_DIR/.git" ]; then
    echo "Thread submodule not initialized at $THREAD_DIR" >&2
    exit 0
fi

cd "$THREAD_DIR"

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
    if [ -n "$THREAD_ID" ]; then
        # Specific thread mode: stage entire thread folder
        if [ ! -d "$THREAD_ID" ]; then
            echo "Thread directory not found: $THREAD_ID" >&2
            exit 0
        fi

        # Stage all files in the thread folder (untracked + modified)
        git add "$THREAD_ID/"

        # Check if there are any staged changes
        if git diff --cached --quiet; then
            echo "No changes in thread $THREAD_ID"
            exit 0
        fi

        # Show what will be committed
        echo "Files staged for commit:"
        git diff --cached --name-only

        # Create commit with thread-specific message
        echo "Committing thread $THREAD_ID..."
        git commit -m "thread: sync $THREAD_ID $(date +%Y%m%d-%H%M%S)"

        echo "Thread $THREAD_ID committed successfully"
    else
        # Batch mode: stage files matching patterns (for push-threads.sh)
        # Stage untracked thread files (new threads get all files including metadata.json)
        # Also stage todo files in raw-data/todos/ and shared plans in plans/
        untracked_files=$(git ls-files --others --exclude-standard -- '*/raw-data/*' '*/timeline.json*' '*/metadata.json' 'plans/*.md' 2>/dev/null || true)

        if [ -n "$untracked_files" ]; then
            echo "Staging untracked thread files..."
            echo "$untracked_files" | xargs git add
        fi

        # Stage modifications to raw-data, timeline, metadata, and shared plans
        modified_files=$(git diff --name-only -- '*/raw-data/*' '*/timeline.json*' '*/metadata.json' 'plans/*.md' 2>/dev/null || true)

        if [ -n "$modified_files" ]; then
            echo "Staging modified thread files..."
            echo "$modified_files" | xargs git add
        fi

        # Check if there are any staged changes
        if git diff --cached --quiet; then
            echo "No thread files to commit"
            exit 0
        fi

        # Show what will be committed
        echo "Files staged for commit:"
        git diff --cached --name-only

        # Create commit
        echo "Committing thread files..."
        git commit -m "thread: batch sync $(date +%Y%m%d-%H%M%S)"

        echo "Thread files committed successfully"
    fi
}

do_commit
