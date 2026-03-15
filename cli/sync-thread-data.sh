#!/bin/bash

# sync-thread-data.sh - Push-only rsync of thread bulk data to remote machine
#
# Syncs timeline, raw-data, memory, and plans directories via rsync with
# --append-verify for efficient incremental transfer of append-only files.
# Excludes git-tracked metadata.json and dead-weight normalized-session.json.
#
# Usage:
#   sync-thread-data.sh [--verbose]
#
# Called by:
#   - sync-all.sh Step 1 (after thread git sync completes)
#
# Key invariants:
#   - Push-only: local machine pushes to remote. No pull direction.
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

# Detect current host and determine remote target
CURRENT_HOSTNAME=$(hostname)
case "$CURRENT_HOSTNAME" in
    macbook2025)
        REMOTE_THREAD_PATH="storage:/mnt/md0/user-base/thread/"
        ;;
    storage)
        REMOTE_THREAD_PATH="macbook:$THREAD_DIR/"
        ;;
    *)
        log_error "Unknown hostname '$CURRENT_HOSTNAME', cannot determine remote target"
        exit 1
        ;;
esac

log_verbose "Pushing thread bulk data to $REMOTE_THREAD_PATH"

# Rsync with append-verify for efficient incremental transfer of append-only files.
# Filter order matters (first match wins):
#   1. Exclude normalized-session.json (8.8 GB dead weight, never read)
#   2. Include directories for traversal
#   3. Include bulk data patterns
#   4. Exclude everything else (metadata.json, .git, etc. are excluded by catchall)
rsync -rlptD \
    --append-verify \
    --timeout=120 \
    --prune-empty-dirs \
    --exclude='normalized-session.json' \
    --include='*/' \
    --include='*/timeline.jsonl' \
    --include='*/timeline.json' \
    --include='*/raw-data/***' \
    --include='*/memory/***' \
    --include='plans/***' \
    --exclude='*' \
    "$THREAD_DIR/" "$REMOTE_THREAD_PATH"

RSYNC_EXIT=$?

if [ $RSYNC_EXIT -eq 0 ]; then
    log_verbose "Thread bulk data push completed successfully"
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
    log_error "rsync failed with exit code $RSYNC_EXIT"
fi

exit $RSYNC_EXIT
