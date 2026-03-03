#!/bin/bash

# pull-submodule.sh - Generic submodule pull (fetch + rebase)
#
# Usage:
#   pull-submodule.sh <submodule-path>
#
# Arguments:
#   submodule-path: Path relative to USER_BASE_DIRECTORY (e.g., "repository/active/homelab")
#
# Called by:
#   - Post-receive hooks on storage server to update local working copy
#   - Can also be called manually for any submodule
#
# Behavior:
#   1. Fetches from remote
#   2. Rebases local on remote if behind or diverged
#   3. Aborts rebase on failure (requires manual intervention)

set -e

if [ -z "$1" ]; then
    echo "Usage: pull-submodule.sh <submodule-path>" >&2
    exit 1
fi

SUBMODULE_PATH="$1"

# Require USER_BASE_DIRECTORY to be set
source "$(dirname "$0")/lib/paths.sh"

FULL_PATH="$USER_BASE_DIRECTORY/$SUBMODULE_PATH"
SUBMODULE_NAME=$(basename "$SUBMODULE_PATH")

if [ ! -d "$FULL_PATH/.git" ] && [ ! -f "$FULL_PATH/.git" ]; then
    echo "Submodule not initialized at $FULL_PATH" >&2
    exit 1
fi

# Safety checks
GIT_DIR=$(git -C "$FULL_PATH" rev-parse --git-dir 2>/dev/null) || {
    echo "Not a git repository: $FULL_PATH" >&2
    exit 1
}

if [ -f "$GIT_DIR/MERGE_HEAD" ]; then
    echo "$SUBMODULE_NAME: merge in progress, cannot pull" >&2
    exit 1
fi

if [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
    echo "$SUBMODULE_NAME: rebase in progress, cannot pull" >&2
    exit 1
fi

# Hard invariant: never pull when dirty
if ! git -C "$FULL_PATH" diff --quiet 2>/dev/null || \
   ! git -C "$FULL_PATH" diff --cached --quiet 2>/dev/null; then
    echo "$SUBMODULE_NAME: dirty working directory, skipping pull"
    exit 0
fi

echo "Fetching $SUBMODULE_NAME from remote..."
if ! git -C "$FULL_PATH" fetch origin 2>/dev/null; then
    echo "$SUBMODULE_NAME: fetch failed" >&2
    exit 1
fi

CURRENT_BRANCH=$(git -C "$FULL_PATH" rev-parse --abbrev-ref HEAD)
REMOTE_BRANCH="origin/$CURRENT_BRANCH"

if ! git -C "$FULL_PATH" rev-parse --verify "$REMOTE_BRANCH" >/dev/null 2>&1; then
    echo "$SUBMODULE_NAME: no remote branch $REMOTE_BRANCH, nothing to pull"
    exit 0
fi

LOCAL_COMMIT=$(git -C "$FULL_PATH" rev-parse HEAD)
REMOTE_COMMIT=$(git -C "$FULL_PATH" rev-parse "$REMOTE_BRANCH")
MERGE_BASE=$(git -C "$FULL_PATH" merge-base HEAD "$REMOTE_BRANCH")

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo "$SUBMODULE_NAME: already up to date"
    exit 0
elif [ "$REMOTE_COMMIT" = "$MERGE_BASE" ]; then
    echo "$SUBMODULE_NAME: local is ahead of remote, nothing to pull"
    exit 0
elif [ "$LOCAL_COMMIT" = "$MERGE_BASE" ]; then
    echo "$SUBMODULE_NAME: behind remote, rebasing..."
    if ! git -C "$FULL_PATH" rebase "$REMOTE_BRANCH" 2>/dev/null; then
        git -C "$FULL_PATH" rebase --abort 2>/dev/null || true
        echo "$SUBMODULE_NAME: rebase failed, manual intervention required" >&2
        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
            --title "Sync failed: $SUBMODULE_NAME" \
            --message "pull-submodule: rebase failed on $(hostname)" 2>/dev/null || true
        exit 1
    fi
    echo "$SUBMODULE_NAME: pull completed successfully"
else
    echo "$SUBMODULE_NAME: diverged, rebasing..."
    if ! git -C "$FULL_PATH" rebase "$REMOTE_BRANCH" 2>/dev/null; then
        git -C "$FULL_PATH" rebase --abort 2>/dev/null || true
        echo "$SUBMODULE_NAME: rebase failed (diverged), manual intervention required" >&2
        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
            --title "Sync failed: $SUBMODULE_NAME" \
            --message "pull-submodule: rebase failed (diverged) on $(hostname)" 2>/dev/null || true
        exit 1
    fi
    echo "$SUBMODULE_NAME: rebase completed successfully"
fi
