#!/bin/bash

# Push user-base to remote
# This script commits scheduled-command timestamp changes and pushes to remote
# Called by scheduled-command/base/push-user-base.md
#
# Behavior:
# 1. Commits modified scheduled-command files (timestamp updates from schedule-processor)
# 2. Fetches from remote
# 3. Handles divergence scenarios:
#    - Local ahead: push directly
#    - Local behind: pull with rebase, then check for new local commits
#    - Diverged: rebase local on remote, then push
# 4. On rebase failure: abort and exit (requires manual intervention)

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

# Step 1: Commit modified scheduled-command files (timestamp updates)
echo "Checking for modified scheduled-command files..."
modified_files=$(git diff --name-only -- 'scheduled-command/**/*.md' 2>/dev/null || true)
if [ -n "$modified_files" ]; then
    echo "Staging modified scheduled-command files..."
    echo "$modified_files" | xargs git add
    if ! git diff --cached --quiet; then
        echo "Committing scheduled-command timestamp updates..."
        git commit -m "Update scheduled command timestamps $(date +%Y%m%d-%H%M%S)"
    fi
fi

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
            --title "User-base sync failed" \
            --message "push-user-base: rebase failed on $(hostname), manual intervention required" || true
        exit 1
    fi
    echo "Pull completed successfully"

    # Check if we now have local commits to push
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
            --title "User-base sync failed" \
            --message "push-user-base: rebase failed (diverged) on $(hostname), manual intervention required" || true
        exit 1
    fi
    echo "Rebase completed, pushing..."
    if ! git push origin "$CURRENT_BRANCH"; then
        echo "Push failed after rebase" >&2
        exit 1
    fi
    echo "Push completed successfully"
fi
