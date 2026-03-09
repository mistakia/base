#!/bin/bash

# Pull user-base from remote
# This script fetches and integrates remote changes into the local user-base.
# Called by post-receive hooks on the storage server.
#
# Behavior:
# 1. If dirty working directory (ignoring submodules): skip entirely (hard invariant)
#    - No stash, no overlap check -- wait for next cycle when clean
# 2. Fetches from remote
# 3. Handles divergence scenarios:
#    - Up to date: no-op
#    - Local behind: fast-forward merge
#    - Local ahead: keep local commits (no push from pull job)
#    - Diverged: merge with submodule pointer auto-resolution
# 4. On merge failure: abort and exit
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

# Check for merge/rebase in progress
GIT_DIR=$(git rev-parse --git-dir)
if [ -f "$GIT_DIR/MERGE_HEAD" ]; then
    echo "Merge in progress, cannot pull" >&2
    exit 1
fi
if [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
    echo "Rebase in progress, cannot pull" >&2
    exit 1
fi

# Hard invariant: never pull when dirty (ignoring submodules)
if ! git diff --quiet --ignore-submodules 2>/dev/null || \
   ! git diff --cached --quiet --ignore-submodules 2>/dev/null; then
    echo "Dirty working directory, skipping pull (will retry next cycle)"
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
elif [ "$REMOTE_COMMIT" = "$MERGE_BASE" ]; then
    echo "Local is ahead of remote, leaving local commits unchanged"
    exit 0
fi

PULLED=false

if [ "$LOCAL_COMMIT" = "$MERGE_BASE" ]; then
    # Strictly behind - fast-forward
    echo "Local is behind remote, fast-forwarding..."
    if ! git merge --ff-only "$REMOTE_BRANCH"; then
        echo "Fast-forward merge failed" >&2
        exit 1
    fi
    echo "Pull completed successfully"
    PULLED=true
else
    # Diverged - merge with submodule pointer auto-resolution
    echo "Local and remote have diverged, merging..."
    if ! git merge "$REMOTE_BRANCH" 2>/dev/null; then
        # Check for unmerged files
        unmerged=$(git ls-files -u 2>/dev/null)
        if [ -z "$unmerged" ]; then
            git merge --abort 2>/dev/null || true
            echo "Merge failed (unknown error)" >&2
            "$USER_BASE_DIRECTORY/cli/monitoring/discord-notify.sh" --template service --severity error \
                --title "User-base sync failed" \
                --message "pull-user-base: merge failed on $(hostname), manual intervention required" || true
            exit 1
        fi
        # Check if ALL conflicts are submodule pointers (mode 160000)
        has_file_conflict=$(echo "$unmerged" | awk '$1 != "160000"' | head -1)
        if [ -n "$has_file_conflict" ]; then
            git merge --abort 2>/dev/null || true
            echo "Merge has non-submodule conflicts, aborting" >&2
            "$USER_BASE_DIRECTORY/cli/monitoring/discord-notify.sh" --template service --severity error \
                --title "User-base sync failed" \
                --message "pull-user-base: merge conflict (non-submodule files) on $(hostname), manual intervention required" || true
            exit 1
        fi
        # Auto-resolve submodule pointer conflicts with current HEAD
        conflict_paths=$(echo "$unmerged" | awk '{print $4}' | sort -u)
        while IFS= read -r conflict_path; do
            git add "$conflict_path" 2>/dev/null
            echo "Auto-resolved submodule conflict: $conflict_path"
        done <<< "$conflict_paths"
        if ! GIT_EDITOR=true git merge --continue 2>/dev/null; then
            git merge --abort 2>/dev/null || true
            echo "Merge --continue failed" >&2
            "$USER_BASE_DIRECTORY/cli/monitoring/discord-notify.sh" --template service --severity error \
                --title "User-base sync failed" \
                --message "pull-user-base: merge continue failed on $(hostname), manual intervention required" || true
            exit 1
        fi
    fi
    echo "Merge completed successfully"
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
