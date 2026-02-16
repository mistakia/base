#!/bin/bash

# Push import-history submodule to remote
# This script pushes any local commits in the import-history submodule to remote
# Called by scheduled-command/base/push-import-history.md
#
# Behavior:
# 1. Fetches from remote
# 2. Handles divergence scenarios:
#    - Local ahead: push directly
#    - Local behind: pull with rebase, then push if needed
#    - Diverged: rebase local on remote, then push
# 3. On rebase failure: abort and exit (requires manual intervention)

set -e

# Require USER_BASE_DIRECTORY to be set
source "$(dirname "$0")/lib/paths.sh"

if [ ! -d "$IMPORT_HISTORY_DIR/.git" ] && [ ! -f "$IMPORT_HISTORY_DIR/.git" ]; then
    echo "Import-history submodule not initialized at $IMPORT_HISTORY_DIR" >&2
    exit 1
fi

cd "$IMPORT_HISTORY_DIR"

# Safety checks
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Not in a git repository" >&2
    exit 1
fi

if [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
    echo "Merge in progress, cannot push" >&2
    exit 1
fi

GIT_DIR=$(git rev-parse --git-dir)
if [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
    echo "Rebase in progress, cannot push" >&2
    exit 1
fi

# Fetch from remote
echo "Fetching from remote..."
if ! git fetch origin; then
    echo "Failed to fetch from remote" >&2
    exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
REMOTE_BRANCH="origin/$CURRENT_BRANCH"

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
elif [ "$LOCAL_COMMIT" = "$MERGE_BASE" ]; then
    echo "Local is behind remote, pulling with rebase..."
    if ! git pull --rebase origin "$CURRENT_BRANCH"; then
        echo "Rebase failed, aborting..." >&2
        git rebase --abort 2>/dev/null || true
        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
            --title "Import-history sync failed" \
            --message "push-import-history: rebase failed on $(hostname), manual intervention required" || true
        exit 1
    fi
    echo "Pull completed successfully"

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
    echo "Local is ahead of remote, pushing..."
    if ! git push origin "$CURRENT_BRANCH"; then
        echo "Push failed" >&2
        exit 1
    fi
    echo "Push completed successfully"
else
    echo "Local and remote have diverged, rebasing..."
    if ! git rebase "$REMOTE_BRANCH"; then
        echo "Rebase failed, aborting..." >&2
        git rebase --abort 2>/dev/null || true
        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
            --title "Import-history sync failed" \
            --message "push-import-history: rebase failed (diverged) on $(hostname), manual intervention required" || true
        exit 1
    fi
    echo "Rebase completed, pushing..."
    if ! git push origin "$CURRENT_BRANCH"; then
        echo "Push failed after rebase" >&2
        exit 1
    fi
    echo "Push completed successfully"
fi
