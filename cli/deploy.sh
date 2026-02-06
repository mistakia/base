#!/bin/bash
#
# deploy.sh - Deploy base system to storage server
#
# Usage:
#   ./cli/deploy.sh [options]
#
# Options:
#   --config-only    Only sync config files (no code pull)
#   --code-only      Only pull code (no config sync)
#   --build          Also sync build artifacts
#   --dry-run        Show what would be done without executing
#   -h, --help       Show this help message
#
# This script:
#   1. Syncs config files to storage server
#   2. Pulls latest code from GitHub on storage server
#   3. Reloads PM2 processes

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
REMOTE_HOST="storage"
REMOTE_BASE_DIR="/home/user/base"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Options
DRY_RUN=""
SYNC_CONFIG=true
PULL_CODE=true
SYNC_BUILD=false

usage() {
    head -18 "$0" | tail -16
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --config-only)
            PULL_CODE=false
            shift
            ;;
        --code-only)
            SYNC_CONFIG=false
            shift
            ;;
        --build)
            SYNC_BUILD=true
            shift
            ;;
        --dry-run)
            DRY_RUN="echo [DRY-RUN]"
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo "=================================="
echo "Base Deploy"
echo "=================================="
echo "Local:  $BASE_DIR"
echo "Remote: $REMOTE_HOST:$REMOTE_BASE_DIR"
[ -n "$DRY_RUN" ] && echo -e "${YELLOW}Mode: DRY RUN${NC}"
echo ""

# Check connectivity
echo "Checking remote host connectivity..."
if ! ssh -o ConnectTimeout=5 "$REMOTE_HOST" "echo 'ok'" > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to $REMOTE_HOST${NC}"
    exit 1
fi
echo -e "${GREEN}Connected${NC}"
echo ""

# Step 1: Sync config
if [ "$SYNC_CONFIG" = true ]; then
    echo "Step 1: Syncing config files..."
    if [ -n "$DRY_RUN" ]; then
        "$BASE_DIR/cli/sync-config.sh" --all --dry-run
    else
        "$BASE_DIR/cli/sync-config.sh" --all
    fi
    echo ""
fi

# Step 2: Pull code
if [ "$PULL_CODE" = true ]; then
    echo "Step 2: Pulling latest code on remote..."
    $DRY_RUN ssh "$REMOTE_HOST" "cd $REMOTE_BASE_DIR && git pull origin main"
    echo ""
fi

# Step 3: Sync build (optional)
if [ "$SYNC_BUILD" = true ]; then
    echo "Step 3: Syncing build artifacts..."
    if [ -n "$DRY_RUN" ]; then
        rsync -av --dry-run --exclude 'stats.html' "$BASE_DIR/build/" "$REMOTE_HOST:$REMOTE_BASE_DIR/build"
    else
        rsync -av --exclude 'stats.html' "$BASE_DIR/build/" "$REMOTE_HOST:$REMOTE_BASE_DIR/build"
    fi
    echo ""
fi

# Step 4: Reload PM2
echo "Step 4: Reloading PM2 processes..."
$DRY_RUN ssh "$REMOTE_HOST" "source ~/.nvm/nvm.sh && cd $REMOTE_BASE_DIR && pm2 reload pm2.config.js"
echo ""

echo "=================================="
echo -e "${GREEN}Deploy complete!${NC}"
echo "=================================="
