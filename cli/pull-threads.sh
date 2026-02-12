#!/bin/bash

# Pull thread submodule from remote
# This script fetches and rebases local thread state on top of remote changes
# Called by scheduled-command/base/pull-threads.md
#
# Behavior:
# 1. Acquires lock (shared with auto-commit-threads.sh/push-threads.sh) with retry
# 2. Fetches from remote
# 3. Handles divergence scenarios:
#    - Up to date: no-op
#    - Local behind: rebase local branch on remote
#    - Local ahead: keep local commits (no push from pull job)
#    - Diverged: rebase local on remote
# 4. On rebase failure: abort and exit (requires manual intervention)

set -e

# Locking configuration (shared with auto-commit-threads.sh and push-threads.sh)
LOCKFILE="/tmp/auto-commit-threads.lock"
MAX_RETRIES=3
RETRY_DELAY=2  # seconds (constant delay, not exponential)

# Require USER_BASE_DIRECTORY to be set
source "$(dirname "$0")/lib/paths.sh"

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
    echo "Merge in progress, cannot pull" >&2
    exit 1
fi

# Check for rebase in progress
GIT_DIR=$(git rev-parse --git-dir)
if [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
    echo "Rebase in progress, cannot pull" >&2
    exit 1
fi

# Acquire lock with retry (scheduled job can wait)
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
                echo "Removing stale lock from dead PID $lock_pid"
                rm -f "$LOCKFILE"
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

echo "Fetching from remote..."
if ! git fetch origin; then
    echo "Failed to fetch from remote" >&2
    exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
REMOTE_BRANCH="origin/$CURRENT_BRANCH"

if ! git rev-parse --verify "$REMOTE_BRANCH" >/dev/null 2>&1; then
    echo "Remote branch $REMOTE_BRANCH does not exist, nothing to pull"
    exit 0
fi

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse "$REMOTE_BRANCH")
MERGE_BASE=$(git merge-base HEAD "$REMOTE_BRANCH")

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo "Already up to date with remote"
    exit 0
elif [ "$LOCAL_COMMIT" = "$MERGE_BASE" ]; then
    echo "Local is behind remote, rebasing on $REMOTE_BRANCH..."
    if ! git rebase "$REMOTE_BRANCH"; then
        echo "Rebase failed, aborting..." >&2
        git rebase --abort 2>/dev/null || true
        exit 1
    fi
    echo "Pull completed successfully"
elif [ "$REMOTE_COMMIT" = "$MERGE_BASE" ]; then
    echo "Local is ahead of remote, leaving local commits unchanged"
    exit 0
else
    echo "Local and remote have diverged, rebasing..."
    if ! git rebase "$REMOTE_BRANCH"; then
        echo "Rebase failed, aborting..." >&2
        git rebase --abort 2>/dev/null || true
        echo "Manual intervention required to resolve divergence" >&2
        exit 1
    fi
    echo "Rebase completed successfully"
fi
