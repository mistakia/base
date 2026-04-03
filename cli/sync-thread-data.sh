#!/bin/bash

# sync-thread-data.sh - Rsync thread bulk data between primary and secondary machines
#
# Syncs timeline, raw-data, memory, and plans directories via rsync with
# --append-verify for efficient incremental transfer of append-only files.
# Excludes git-tracked metadata.json and dead-weight normalized-session.json.
#
# Usage:
#   sync-thread-data.sh [--verbose]
#
# Environment variables:
#   REMOTE_THREAD_PATH       - Full rsync target (e.g., storage:/data/user-base/thread/)
#   REMOTE_USER_BASE_DIRECTORY - Remote user-base path (required if REMOTE_THREAD_PATH not set)
#   SYNC_ROLE                - "primary" or "secondary" (default: auto-detect from platform)
#
# Called by:
#   - sync-all.sh Step 1 (after thread git sync completes)
#
# Key invariants:
#   - Primary-initiated: primary pushes to secondary AND pulls from secondary.
#     Secondary never initiates connections to primary (laptop may be unreachable).
#   - No lock needed: sync-all.sh's global lock prevents concurrent instances.
#   - Non-fatal: failures are logged but do not abort the caller.

set -o pipefail

# Parse arguments
VERBOSE=false
for arg in "$@"; do
    case "$arg" in
        --verbose) VERBOSE=true ;;
    esac
done

log() {
    echo "[sync-thread-data] $*"
}

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo "[sync-thread-data] $*"
    fi
}

log_error() {
    echo "[sync-thread-data] ERROR: $*" >&2
}

# Require USER_BASE_DIRECTORY to be set
source "$(dirname "$0")/lib/paths.sh"

# Ensure SSH agent is reachable (same pattern as sync-all.sh)
if [ -n "$SSH_AUTH_SOCK" ] && [ ! -S "$SSH_AUTH_SOCK" ]; then
    LAUNCHD_SOCK=$(ls /private/tmp/com.apple.launchd.*/Listeners 2>/dev/null | head -1)
    if [ -n "$LAUNCHD_SOCK" ] && [ -S "$LAUNCHD_SOCK" ]; then
        export SSH_AUTH_SOCK="$LAUNCHD_SOCK"
    fi
elif [ -z "$SSH_AUTH_SOCK" ]; then
    LAUNCHD_SOCK=$(ls /private/tmp/com.apple.launchd.*/Listeners 2>/dev/null | head -1)
    if [ -n "$LAUNCHD_SOCK" ] && [ -S "$LAUNCHD_SOCK" ]; then
        export SSH_AUTH_SOCK="$LAUNCHD_SOCK"
    fi
fi

# Remote thread path: set via REMOTE_THREAD_PATH env var or derive from SSH host alias + path
# REMOTE_THREAD_PATH takes precedence; otherwise construct from REMOTE_USER_BASE_DIRECTORY
if [ -z "$REMOTE_THREAD_PATH" ] && [ -z "$REMOTE_USER_BASE_DIRECTORY" ]; then
    echo "ERROR: Set REMOTE_THREAD_PATH or REMOTE_USER_BASE_DIRECTORY" >&2
    exit 1
fi
REMOTE_STORAGE_THREAD_PATH="${REMOTE_THREAD_PATH:-storage:${REMOTE_USER_BASE_DIRECTORY}/thread/}"

# Common rsync filter flags for thread bulk data.
# Filter order matters (first match wins):
#   1. Exclude normalized-session.json (8.8 GB dead weight, never read)
#   2. Include directories for traversal
#   3. Include bulk data patterns
#   4. Exclude everything else (metadata.json, .git, etc. are excluded by catchall)
RSYNC_COMMON_OPTS=(
    -rlptD
    --append-verify
    --timeout=120
    --prune-empty-dirs
    --exclude='normalized-session.json'
    --include='*/'
    --include='*/timeline.jsonl'
    --include='*/timeline.json'
    --include='*/raw-data/***'
    --include='*/memory/***'
    --include='plans/***'
    --exclude='*'
)

# Determine machine role.
# SYNC_ROLE can be set explicitly to "primary" or "secondary".
# Falls back to platform detection: darwin = primary, linux = secondary.
if [ -n "$SYNC_ROLE" ]; then
    MACHINE_ROLE="$SYNC_ROLE"
elif [ "$(uname)" = "Darwin" ]; then
    MACHINE_ROLE="primary"
else
    MACHINE_ROLE="secondary"
fi

case "$MACHINE_ROLE" in
    primary)
        # Primary machine: push local data to storage, then pull storage data locally
        RSYNC_EXIT=0

        log_verbose "Pushing thread bulk data to storage"
        rsync "${RSYNC_COMMON_OPTS[@]}" "$THREAD_DIR/" "$REMOTE_STORAGE_THREAD_PATH"
        PUSH_EXIT=$?
        if [ $PUSH_EXIT -ne 0 ]; then
            log_error "push to storage failed with exit code $PUSH_EXIT"
            RSYNC_EXIT=$PUSH_EXIT
        else
            log_verbose "Push to storage completed"
        fi

        log_verbose "Pulling thread bulk data from storage"
        rsync "${RSYNC_COMMON_OPTS[@]}" "$REMOTE_STORAGE_THREAD_PATH" "$THREAD_DIR/"
        PULL_EXIT=$?
        if [ $PULL_EXIT -ne 0 ]; then
            log_error "pull from storage failed with exit code $PULL_EXIT"
            [ $RSYNC_EXIT -eq 0 ] && RSYNC_EXIT=$PULL_EXIT
        else
            log_verbose "Pull from storage completed"
        fi
        ;;
    secondary)
        # Secondary machine: no-op. Primary machine initiates all connections.
        log_verbose "Running on secondary machine -- skipping (primary initiates sync)"
        RSYNC_EXIT=0
        ;;
    *)
        log_error "Unknown SYNC_ROLE '$MACHINE_ROLE', set to 'primary' or 'secondary'"
        exit 1
        ;;
esac

if [ $RSYNC_EXIT -eq 0 ]; then
    log_verbose "Thread bulk data sync completed successfully"
    # Log telemetry event
    TELEMETRY_FILE="$USER_BASE_DIRECTORY/data/sync-telemetry.jsonl"
    if command -v jq >/dev/null 2>&1; then
        TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        HOST_VAL=$(hostname)
        jq -nc --arg ts "$TS" --arg host "$HOST_VAL" --arg event "rsync_thread_data" \
            '{ts:$ts,repo:"thread",host:$host,event:$event}' \
            >> "$TELEMETRY_FILE" 2>/dev/null || true
    fi
else
    log_error "Thread bulk data sync completed with errors"
fi

exit $RSYNC_EXIT
