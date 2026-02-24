#!/bin/bash

# Pull user-base from remote
# This script fetches and rebases local user-base state on top of remote changes
# Called by sync-all.sh (parent sync step) and post-receive hooks
#
# Behavior:
# 1. If dirty working directory: compute overlap between dirty files and incoming changes
#    - No overlap: proceed with rebase (git only touches files in the rebase diff)
#    - Overlap: log filenames, Discord alert, skip sync
#    - No stash -- avoids risk of stash/pop interacting with active sessions
# 2. Fetches from remote
# 3. Handles divergence scenarios:
#    - Up to date: no-op
#    - Local behind: rebase local branch on remote
#    - Local ahead: keep local commits (no push from pull job)
#    - Diverged: rebase local on remote
# 4. On rebase failure: abort and exit
# 5. After successful pull: update submodules

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
    echo "Merge in progress, cannot pull" >&2
    exit 1
fi

# Check for rebase in progress
GIT_DIR=$(git rev-parse --git-dir)
if [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
    echo "Rebase in progress, cannot pull" >&2
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
elif [ "$REMOTE_COMMIT" = "$MERGE_BASE" ]; then
    echo "Local is ahead of remote, leaving local commits unchanged"
    exit 0
fi

# Check for dirty working directory - use overlap check instead of skipping entirely
IS_DIRTY=false
if ! git diff --quiet --ignore-submodules || ! git diff --cached --quiet --ignore-submodules; then
    IS_DIRTY=true
fi

# If dirty, compute overlap between dirty files and incoming changes
if [ "$IS_DIRTY" = true ]; then
    # Collect dirty files (staged + unstaged, deduplicated)
    dirty_files=$({ git diff --name-only --ignore-submodules 2>/dev/null; git diff --cached --name-only --ignore-submodules 2>/dev/null; } | sort -u)

    # Collect incoming files from remote
    incoming_files=$(git diff --name-only --ignore-submodules "$MERGE_BASE".."$REMOTE_BRANCH" 2>/dev/null | sort -u)

    # Check for overlap
    overlap=$(comm -12 <(echo "$dirty_files") <(echo "$incoming_files"))

    if [ -n "$overlap" ]; then
        echo "Overlap detected between dirty files and incoming changes:" >&2
        echo "$overlap" | while read -r f; do echo "  $f" >&2; done
        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity warning \
            --title "Sync blocked: file overlap" \
            --message "pull-user-base on $(hostname): dirty files overlap with incoming changes. Files: $(echo "$overlap" | tr '\n' ', ')" || true
        exit 0
    fi

    echo "Dirty working directory but no overlap with incoming changes, proceeding with rebase..."
fi

PULLED=false

if [ "$LOCAL_COMMIT" = "$MERGE_BASE" ]; then
    echo "Local is behind remote, rebasing on $REMOTE_BRANCH..."
    if ! git rebase --autostash "$REMOTE_BRANCH"; then
        echo "Rebase failed, aborting..." >&2
        git rebase --abort 2>/dev/null || true
        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
            --title "User-base sync failed" \
            --message "pull-user-base: rebase failed on $(hostname), manual intervention required" || true
        exit 1
    fi
    echo "Pull completed successfully"
    PULLED=true
else
    echo "Local and remote have diverged, rebasing..."
    if ! git rebase --autostash "$REMOTE_BRANCH"; then
        echo "Rebase failed, aborting..." >&2
        git rebase --abort 2>/dev/null || true
        "$USER_BASE_DIRECTORY/cli/discord-notify.sh" --template service --severity error \
            --title "User-base sync failed" \
            --message "pull-user-base: rebase failed (diverged) on $(hostname), manual intervention required" || true
        exit 1
    fi
    echo "Rebase completed successfully"
    PULLED=true
fi

# Update submodules after successful pull
if [ "$PULLED" = true ]; then
    echo "Updating submodules..."

    # On the storage server, rewrite storage: URLs to local paths
    git config --file .gitmodules --get-regexp url | while read -r key url; do
        submodule_name=$(echo "$key" | sed 's/submodule\.\(.*\)\.url/\1/')
        if echo "$url" | grep -q '^storage:'; then
            local_path=$(echo "$url" | sed 's|^storage:||')
            echo "Rewriting storage: URL for $submodule_name -> $local_path"
            git config "submodule.${submodule_name}.url" "$local_path"
        fi
    done

    # Update only the base submodule -- other submodules are managed by
    # their own push/pull cycles or are not needed on every machine
    git submodule update --init \
        repository/active/base \
        2>&1 || echo "WARNING: Submodule update failed"
    echo "Submodule update completed"
fi
