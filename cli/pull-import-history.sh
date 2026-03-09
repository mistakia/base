#!/bin/bash

# Pull import-history submodule from remote
# This script fetches and rebases local import-history state on top of remote changes
# Called by scheduled-command/base/pull-import-history.md
#
# Behavior:
# 1. Fetches from remote
# 2. Handles divergence scenarios:
#    - Up to date: no-op
#    - Local behind: rebase local branch on remote
#    - Local ahead: keep local commits (no push from pull job)
#    - Diverged: rebase local on remote
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
    echo "Merge in progress, cannot pull" >&2
    exit 1
fi

GIT_DIR=$(git rev-parse --git-dir)
if [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
    echo "Rebase in progress, cannot pull" >&2
    exit 1
fi

# Hard invariant: never pull when dirty (auto-commit handles dirty state)
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    echo "Dirty working directory, skipping pull (auto-commit will handle)"
    exit 0
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
        "$USER_BASE_DIRECTORY/cli/monitoring/discord-notify.sh" --template service --severity error \
            --title "Import-history sync failed" \
            --message "pull-import-history: rebase failed on $(hostname), manual intervention required" || true
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
        "$USER_BASE_DIRECTORY/cli/monitoring/discord-notify.sh" --template service --severity error \
            --title "Import-history sync failed" \
            --message "pull-import-history: rebase failed (diverged) on $(hostname), manual intervention required" || true
        exit 1
    fi
    echo "Rebase completed successfully"
fi
