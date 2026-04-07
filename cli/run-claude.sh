#!/bin/bash
# run-claude.sh - Execute Claude CLI for automation
#
# Unified wrapper for non-interactive Claude sessions.
# Detects execution context (host or container) and routes accordingly.
# Always runs with automation flags (-p --dangerously-skip-permissions).
#
# Usage:
#   run-claude.sh "prompt text"
#   run-claude.sh "Run workflow [[user:workflow/example.md]]"
#
# Note: This script is intended to be called via the command queue.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Require USER_BASE_DIRECTORY to be set
source "$SCRIPT_DIR/lib/paths.sh"

USER_BASE_DIR="$USER_BASE_DIRECTORY"
CONTAINER_NAME="base-container"
CONTAINER_WORKDIR="$USER_BASE_DIRECTORY"

# Detect if running inside container
is_container() {
    [ -f "/.dockerenv" ]
}

if [ $# -eq 0 ]; then
    echo "Usage: run-claude.sh \"prompt text\""
    echo "Runs Claude CLI in non-interactive mode for automation."
    exit 1
fi

if is_container; then
    # Inside container: execute claude directly from user-base
    cd "$USER_BASE_DIR" 2>/dev/null || cd "$CONTAINER_WORKDIR"
    exec claude -p --dangerously-skip-permissions -- "$@"
else
    # On host: execute via docker exec (non-interactive)
    exec docker exec -u node -w "$CONTAINER_WORKDIR" "$CONTAINER_NAME" \
        claude -p --dangerously-skip-permissions -- "$@"
fi
