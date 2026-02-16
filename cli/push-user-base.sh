#!/bin/bash

# Push user-base to remote
# Called by scheduled-command/base/push-user-base.md
#
# Behavior:
# 1. Fetches from remote
# 2. Only pushes if local is strictly ahead of remote
# 3. Skips if behind or diverged (pull-user-base handles incoming changes)

set -e

# Require USER_BASE_DIRECTORY to be set
source "$(dirname "$0")/lib/paths.sh"

cd "$USER_BASE_DIRECTORY"

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

echo "Fetching from remote..."
if ! git fetch origin; then
    echo "Failed to fetch from remote" >&2
    exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
REMOTE_BRANCH="origin/$CURRENT_BRANCH"

# Check if remote branch exists
if ! git rev-parse --verify "$REMOTE_BRANCH" >/dev/null 2>&1; then
    echo "Remote branch $REMOTE_BRANCH does not exist, pushing..."
    git push -u origin "$CURRENT_BRANCH"
    echo "Push completed successfully"
    exit 0
fi

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse "$REMOTE_BRANCH")
MERGE_BASE=$(git merge-base HEAD "$REMOTE_BRANCH")

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo "Already up to date with remote"
    exit 0
elif [ "$REMOTE_COMMIT" = "$MERGE_BASE" ]; then
    # Local is ahead - push directly
    echo "Local is ahead of remote, pushing..."
    if ! git push origin "$CURRENT_BRANCH"; then
        echo "Push failed" >&2
        exit 1
    fi
    echo "Push completed successfully"
elif [ "$LOCAL_COMMIT" = "$MERGE_BASE" ]; then
    echo "Local is behind remote, skipping push (pull-user-base will sync)"
    exit 0
else
    echo "Local and remote have diverged, skipping push (pull-user-base will sync)"
    exit 0
fi
