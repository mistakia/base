#!/bin/bash
# post-receive hook for user-base-threads bare repository
#
# Deployment: Copy to <bare-repo>/hooks/post-receive on the secondary machine.
#
# This hook runs when the primary machine pushes thread commits to the secondary
# machine's bare repo. It updates the working directory to match the pushed
# state, preserving any uncommitted changes from active sessions via stash/unstash.
#
# Key behavior:
#   - Ensures the working tree is on `main` (not detached HEAD) before resetting
#   - Stashes uncommitted changes, resets to origin/main, then restores stash
#   - Primary machine is authoritative for committed history
#
# Configuration: Set these variables for your deployment, or override via
# environment variables in the bare repo's hooks/environment file.

WORKING_DIR="${HOOK_THREAD_WORKING_DIR:-${USER_BASE_DIRECTORY:-/mnt/md0/user-base}/thread}"
LOG_FILE="${HOOK_LOG_FILE:-${HOME}/logs/user-base-threads-post-receive.log}"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

cd "$WORKING_DIR" || {
    log "ERROR: Cannot change to working directory $WORKING_DIR"
    exit 1
}

unset GIT_DIR

log "Starting post-receive hook"

git fetch origin main || {
    log "ERROR: Failed to fetch from origin"
    exit 1
}

# Ensure we are on main branch (submodules can end up in detached HEAD,
# which causes git reset to advance the detached HEAD without moving main)
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
if [ "$CURRENT_BRANCH" != "main" ]; then
    log "Not on main (current: ${CURRENT_BRANCH:-DETACHED}), checking out main"
    git checkout main 2>/dev/null || git checkout -b main origin/main
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date"
    exit 0
fi

log "Changes detected: local=$LOCAL remote=$REMOTE"

# Stash uncommitted changes (storage server's active session data)
STASHED=0
if [ -n "$(git status --porcelain)" ]; then
    STASH_MSG="auto-stash before reset $(date +%Y%m%d-%H%M%S)"
    log "Stashing uncommitted changes: $STASH_MSG"
    if git stash push -m "$STASH_MSG"; then
        STASHED=1
    else
        log "WARNING: Failed to stash changes"
    fi
fi

# Reset to origin (local machine is authoritative)
log "Resetting to origin/main"
git reset --hard origin/main

# Restore stashed changes (storage server's active session)
if [ "$STASHED" = "1" ]; then
    log "Restoring stashed changes"
    git stash pop || log "WARNING: Stash pop had conflicts - check git stash list"
fi

log "Post-receive hook completed"
