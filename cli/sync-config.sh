#!/bin/bash
#
# sync-config.sh - Sync base config files from local to remote storage server
#
# Usage:
#   ./cli/sync-config.sh [options]
#
# Options:
#   --dry-run    Show what would be synced without actually syncing
#   --pm2        Also sync PM2 config file
#   --all        Sync all config files including PM2 config
#   -h, --help   Show this help message

set -e

# Configuration
REMOTE_HOST="storage"
REMOTE_BASE_DIR="/home/user/base"
LOCAL_BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default options
DRY_RUN=""
SYNC_PM2=false
SYNC_ALL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        --pm2)
            SYNC_PM2=true
            shift
            ;;
        --all)
            SYNC_ALL=true
            shift
            ;;
        -h|--help)
            head -20 "$0" | tail -15
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Print header
echo "=================================="
echo "Base Config Sync"
echo "=================================="
echo "Local:  $LOCAL_BASE_DIR"
echo "Remote: $REMOTE_HOST:$REMOTE_BASE_DIR"
if [ -n "$DRY_RUN" ]; then
    echo -e "${YELLOW}Mode: DRY RUN (no changes will be made)${NC}"
fi
echo ""

# Check if remote is reachable
echo "Checking remote host connectivity..."
if ! ssh -o ConnectTimeout=5 "$REMOTE_HOST" "echo 'connected'" > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to $REMOTE_HOST${NC}"
    echo "Make sure you have SSH access configured for the 'storage' host."
    exit 1
fi
echo -e "${GREEN}Remote host is reachable${NC}"
echo ""

# Sync config directory
echo "Syncing config/ directory..."
rsync -avz $DRY_RUN \
    --exclude 'config-test.json' \
    --exclude '*.bak' \
    --exclude '*.tmp' \
    "$LOCAL_BASE_DIR/config/" \
    "$REMOTE_HOST:$REMOTE_BASE_DIR/config/"

echo ""

# Sync PM2 config if requested
if [ "$SYNC_PM2" = true ] || [ "$SYNC_ALL" = true ]; then
    echo "Syncing PM2 config..."
    rsync -avz $DRY_RUN \
        "$LOCAL_BASE_DIR/pm2.config.js" \
        "$REMOTE_HOST:$REMOTE_BASE_DIR/"
    echo ""
fi

# Summary
echo "=================================="
if [ -n "$DRY_RUN" ]; then
    echo -e "${YELLOW}Dry run complete. No changes were made.${NC}"
    echo "Run without --dry-run to apply changes."
else
    echo -e "${GREEN}Sync complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. SSH to remote: ssh $REMOTE_HOST"
    echo "  2. Reload PM2: cd $REMOTE_BASE_DIR && pm2 reload pm2.config.js"
fi
echo "=================================="
