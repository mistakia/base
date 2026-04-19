#!/bin/bash

# Auto-commit thread files to git
# This script stages and commits thread files within the thread submodule
# Called by Claude Code sync-claude-session.sh hook or push-threads.sh
#
# Usage:
#   auto-commit-threads.sh [--skip-lock] [--no-sweep] [thread_id]
#
# Options:
#   --skip-lock   Skip lock acquisition (caller already holds lock)
#   --no-sweep    Skip the orphan-directory sweep (maintenance escape hatch)
#
# Environment:
#   AUTO_COMMIT_THREADS_NO_SWEEP=1 equivalent to --no-sweep
#
# Behavior:
# - Operates within the thread/ submodule (separate git repo)
# - If thread_id provided: stages entire thread folder (all files)
# - If no thread_id: stages matching patterns for batch commits
# - Creates a normal commit (not amend) for dual-machine compatibility
# - Uses file locking to prevent concurrent execution
# - Non-blocking: exits immediately if lock held (scheduled job will handle)
# - Pre-stage orphan sweep: any thread/<id>/ directory whose metadata.json is
#   absent AND not tracked in git HEAD AND has no .import.lock is rm -rf'd.
#   metadata.json is the directory's lifecycle anchor; git rm metadata.json on
#   any machine propagates to every machine's sweep on the next sync round.

set -e

# Parse arguments
SKIP_LOCK=false
NO_SWEEP=false
if [ "${AUTO_COMMIT_THREADS_NO_SWEEP:-}" = "1" ]; then
    NO_SWEEP=true
fi
THREAD_ID=""
for arg in "$@"; do
    case "$arg" in
        --skip-lock) SKIP_LOCK=true ;;
        --no-sweep) NO_SWEEP=true ;;
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

# Enforce working tree and git dir boundary to prevent cross-submodule
# contamination. All three env vars must be set together before any git
# commands run:
# - GIT_WORK_TREE: prevents git from searching upward for a repo
# - GIT_DIR: directs git to the correct gitdir
# - GIT_INDEX_FILE: overrides any inherited value from a parent hook
#   (git sets GIT_INDEX_FILE in post-commit hooks; if this script is
#   called from sync-all.sh which was triggered by a different
#   submodule's hook, the inherited GIT_INDEX_FILE would point to
#   the wrong submodule's index, causing cross-contamination)
unset GIT_INDEX_FILE
export GIT_WORK_TREE="$THREAD_DIR"
export GIT_DIR
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || {
    echo "Not in a git repository" >&2
    exit 0
}

# Check for merge conflicts
if [ -f "$GIT_DIR/MERGE_HEAD" ]; then
    echo "Merge in progress, skipping auto-commit" >&2
    exit 0
fi

# Check for rebase in progress
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

# Wait for git index.lock to be released (handles concurrent git operations)
# Retries up to MAX_WAIT seconds, then removes stale locks
wait_for_git_index_lock() {
    local git_dir
    git_dir=$(git rev-parse --git-dir)
    local index_lock="$git_dir/index.lock"
    local max_wait=10
    local waited=0

    while [ -f "$index_lock" ] && [ $waited -lt $max_wait ]; do
        # Check if the lock holder is still alive (if lock contains PID info)
        local lock_age
        if [ "$(uname)" = "Darwin" ]; then
            lock_age=$(( $(date +%s) - $(stat -f %m "$index_lock" 2>/dev/null || echo 0) ))
        else
            lock_age=$(( $(date +%s) - $(stat -c %Y "$index_lock" 2>/dev/null || echo 0) ))
        fi

        # If lock is older than 5 minutes, it's almost certainly stale
        if [ "$lock_age" -gt 300 ]; then
            echo "Removing stale git index.lock (age: ${lock_age}s)"
            rm -f "$index_lock"
            return 0
        fi

        echo "Waiting for git index.lock (age: ${lock_age}s)..."
        sleep 1
        waited=$((waited + 1))
    done

    if [ -f "$index_lock" ]; then
        echo "Git index.lock still held after ${max_wait}s, skipping commit"
        exit 0
    fi
}

# Pre-stage orphan sweep: remove thread/<id>/ directories whose metadata.json
# is absent AND not tracked in git HEAD AND has no .import.lock. This is the
# tear-down half of the metadata-anchor lifecycle: git rm metadata.json on any
# machine, sync, and the next sweep on every other machine garbage-collects
# the gitignored raw-data/ and timeline.jsonl that would otherwise orphan in
# place. Only directories whose names look like UUIDs are swept, to avoid
# accidentally touching submodule metadata (.git, plans/, .gitignore, ...).
UUID_GLOB='[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'

sweep_orphan_dirs() {
    local swept=0
    local memory_removed=0
    local id
    for entry in $UUID_GLOB; do
        # No matches: shell leaves the literal glob, which fails -d
        [ -d "$entry" ] || continue
        id="$entry"

        # Clean up the unused memory/ subdirectory wherever it exists. It is
        # no longer created by create_thread; this catches legacy directories.
        if [ -d "$id/memory" ]; then
            rm -rf "$id/memory"
            memory_removed=$((memory_removed + 1))
        fi

        # Skip if metadata.json is present on disk -- thread is live
        if [ -f "$id/metadata.json" ]; then
            continue
        fi
        # Skip if an active import is mid-write
        if [ -f "$id/.import.lock" ]; then
            continue
        fi
        # Skip if metadata.json is tracked in git HEAD -- deletion not yet
        # pulled, or a local-only removal we should not yet enforce
        if git cat-file -e "HEAD:$id/metadata.json" 2>/dev/null; then
            continue
        fi
        echo "Sweeping orphan thread directory: $id"
        rm -rf "$id"
        swept=$((swept + 1))
    done
    if [ "$swept" -gt 0 ]; then
        echo "Swept $swept orphan thread directories"
    fi
    if [ "$memory_removed" -gt 0 ]; then
        echo "Removed $memory_removed legacy memory/ subdirectories"
    fi
}

# Perform git operations
do_commit() {
    if [ -n "$THREAD_ID" ]; then
        # Specific thread mode: stage entire thread folder
        if [ ! -d "$THREAD_ID" ]; then
            echo "Thread directory not found: $THREAD_ID" >&2
            return 0
        fi

        # Refuse to stage a thread dir that has no metadata.json. This
        # normally means the thread was deleted upstream; the sweep above
        # (or the next one) will tear the local directory down. Do not
        # resurrect it in the index.
        if [ ! -f "$THREAD_ID/metadata.json" ]; then
            echo "Thread $THREAD_ID has no metadata.json, refusing to stage (deleted upstream or mid-delete)"
            return 0
        fi

        # Stage all files in the thread folder (untracked + modified)
        # Stages deletions too; if a defective deletion appears here, apply the batch-branch guard below.
        git add "$THREAD_ID/"

        # Check if there are any staged changes
        if git diff --cached --quiet; then
            echo "No changes in thread $THREAD_ID"
            return 0
        fi

        # Show what will be committed
        echo "Files staged for commit:"
        git diff --cached --name-only

        # Create commit with thread-specific message
        echo "Committing thread $THREAD_ID..."
        git commit -m "thread: sync $THREAD_ID $(date +%Y%m%d-%H%M%S)"

        echo "Thread $THREAD_ID committed successfully"
    else
        # Batch mode: stage metadata files (bulk data synced via rsync, not git)
        # Stage untracked metadata (new threads)
        untracked_files=$(git ls-files --others --exclude-standard -- '*/metadata.json' 2>/dev/null || true)

        if [ -n "$untracked_files" ]; then
            echo "Staging untracked metadata..."
            echo "$untracked_files" | xargs git add
        fi

        # Stage modified metadata
        modified_files=$(git diff --name-only --diff-filter=M -- '*/metadata.json' 2>/dev/null || true)

        if [ -n "$modified_files" ]; then
            echo "Staging modified metadata..."
            echo "$modified_files" | xargs git add
        fi

        # Stage deleted metadata, but only when sibling bulk data is absent. A
        # metadata.json deletion while raw-data/ or timeline.jsonl is still on
        # disk indicates an upstream bug (e.g. a failed stash-pop) rather than
        # a legitimate thread teardown; commit the deletion and the thread is
        # silently lost on every other machine.
        deleted_files=$(git diff --name-only --diff-filter=D -- '*/metadata.json' 2>/dev/null || true)

        if [ -n "$deleted_files" ]; then
            while IFS= read -r path; do
                # $path is submodule-root-relative (GIT_WORK_TREE=$THREAD_DIR + cd above),
                # so dirname yields <uuid>.
                thread_dir=$(dirname "$path")
                if [ -d "$thread_dir/raw-data" ] || [ -f "$thread_dir/timeline.jsonl" ]; then
                    echo "refusing to stage deletion of $path: siblings present" >&2
                    continue
                fi
                git rm --quiet "$path"
            done <<< "$deleted_files"
        fi

        # Check if there are any staged changes
        if git diff --cached --quiet; then
            echo "No thread files to commit"
            return 0
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

wait_for_git_index_lock
if [ "$NO_SWEEP" = false ]; then
    sweep_orphan_dirs
fi
do_commit

# Push any unpushed commits (best-effort, bypasses sync_repo overhead)
# Runs after every invocation, not just after new commits, to drain backlog
# sync-all Step 1 remains as fallback for failures and diverged state
if git remote get-url origin &>/dev/null; then
    local_head=$(git rev-parse HEAD 2>/dev/null)
    remote_head=$(git rev-parse origin/main 2>/dev/null)
    if [ "$local_head" != "$remote_head" ]; then
        git push origin main 2>/dev/null || true
    fi
fi
