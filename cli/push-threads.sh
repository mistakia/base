#!/bin/bash

# Push thread submodule to remote
# This script commits any uncommitted thread files and pushes to remote
# Called by scheduled-command/base/push-threads.md
#
# Behavior:
# 1. Acquires lock (shared with auto-commit-threads.sh) with retry
# 2. Commits any uncommitted thread files via auto-commit-threads.sh
# 3. Fetches from remote
# 4. Handles divergence scenarios:
#    - Local ahead: push directly
#    - Local behind: pull with rebase, then check for new local commits
#    - Diverged: rebase local on remote, then push
# 5. On rebase failure: abort and exit (requires manual intervention)

set -e

# Locking configuration (shared with auto-commit-threads.sh)
LOCKFILE="/tmp/auto-commit-threads.lock"
MAX_RETRIES=3
RETRY_DELAY=2  # seconds (constant delay, not exponential)

# Require USER_BASE_DIRECTORY to be set
source "$(dirname "$0")/lib/paths.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$THREAD_DIR/.git" ] && [ ! -f "$THREAD_DIR/.git" ]; then
    echo "Thread submodule not initialized at $THREAD_DIR" >&2
    exit 1
fi

cd "$THREAD_DIR"

# Safety checks
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Not in a git repository" >&2
    exit 1
fi

# Check for merge conflicts
if [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
    echo "Merge in progress, cannot push" >&2
    exit 1
fi

# Check for rebase in progress
GIT_DIR=$(git rev-parse --git-dir)
if [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
    echo "Rebase in progress, cannot push" >&2
    exit 1
fi

# Acquire lock with retry (scheduled job can wait)
# Only this script handles stale lock removal to avoid race conditions
acquire_lock() {
    local retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        # Try to acquire lock atomically
        if ( set -o noclobber; echo $$ > "$LOCKFILE" ) 2>/dev/null; then
            trap 'rm -f "$LOCKFILE"' EXIT INT TERM
            return 0
        fi

        # Lock file exists - check if holder is still alive
        if [ -f "$LOCKFILE" ]; then
            local lock_pid
            lock_pid=$(cat "$LOCKFILE" 2>/dev/null) || true

            if [ -n "$lock_pid" ] && ! kill -0 "$lock_pid" 2>/dev/null; then
                # Lock holder is dead - safe to remove since we're the scheduled job
                # and will immediately try to acquire
                echo "Removing stale lock from dead PID $lock_pid"
                rm -f "$LOCKFILE"
                # Don't increment retry, try to acquire immediately
                continue
            fi
        fi

        echo "Lock held by PID $(cat "$LOCKFILE" 2>/dev/null || echo "unknown"), retrying in ${RETRY_DELAY}s (attempt $((retry + 1))/$MAX_RETRIES)"
        sleep $RETRY_DELAY
        retry=$((retry + 1))
    done

    echo "Could not acquire lock after $MAX_RETRIES attempts" >&2
    return 1
}

# Acquire lock before proceeding
if ! acquire_lock; then
    exit 1
fi

# Step 1: Commit any uncommitted thread files
# Use --skip-lock since we already hold the lock
echo "Checking for uncommitted thread files..."
"$SCRIPT_DIR/auto-commit-threads.sh" --skip-lock || true

# Step 2: Fetch from remote
echo "Fetching from remote..."
if ! git fetch origin; then
    echo "Failed to fetch from remote" >&2
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
REMOTE_BRANCH="origin/$CURRENT_BRANCH"

# Check if remote branch exists
if ! git rev-parse --verify "$REMOTE_BRANCH" >/dev/null 2>&1; then
    echo "Remote branch $REMOTE_BRANCH does not exist, pushing..."
    git push -u origin "$CURRENT_BRANCH"
    echo "Push completed successfully"
    exit 0
fi

# Step 3: Determine divergence state
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse "$REMOTE_BRANCH")
MERGE_BASE=$(git merge-base HEAD "$REMOTE_BRANCH")

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo "Already up to date with remote"
    exit 0
elif [ "$LOCAL_COMMIT" = "$MERGE_BASE" ]; then
    # Local is behind remote - pull with rebase
    echo "Local is behind remote, pulling with rebase..."
    if ! git pull --rebase origin "$CURRENT_BRANCH"; then
        echo "Rebase failed, aborting..." >&2
        git rebase --abort 2>/dev/null || true
        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
            --title "Thread sync failed" \
            --message "push-threads: rebase failed on $(hostname), manual intervention required" || true
        exit 1
    fi
    echo "Pull completed successfully"

    # Check if we now have local commits to push (created during the pull window)
    NEW_LOCAL=$(git rev-parse HEAD)
    NEW_REMOTE=$(git rev-parse "$REMOTE_BRANCH")
    if [ "$NEW_LOCAL" != "$NEW_REMOTE" ]; then
        echo "New local commits detected, pushing..."
        if ! git push origin "$CURRENT_BRANCH"; then
            echo "Push failed" >&2
            exit 1
        fi
        echo "Push completed successfully"
    fi
elif [ "$REMOTE_COMMIT" = "$MERGE_BASE" ]; then
    # Local is ahead - push directly
    echo "Local is ahead of remote, pushing..."
    if ! git push origin "$CURRENT_BRANCH"; then
        echo "Push failed" >&2
        exit 1
    fi
    echo "Push completed successfully"
else
    # Diverged - rebase local on remote, then push
    echo "Local and remote have diverged, rebasing..."
    if ! git rebase "$REMOTE_BRANCH"; then
        echo "Rebase failed, aborting..." >&2
        git rebase --abort 2>/dev/null || true
        echo "Manual intervention required to resolve divergence" >&2
        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
            --title "Thread sync failed" \
            --message "push-threads: rebase failed (diverged) on $(hostname), manual intervention required" || true
        exit 1
    fi
    echo "Rebase completed, pushing..."
    if ! git push origin "$CURRENT_BRANCH"; then
        echo "Push failed after rebase" >&2
        exit 1
    fi
    echo "Push completed successfully"
fi
