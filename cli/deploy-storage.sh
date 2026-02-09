#!/bin/bash
# deploy-storage.sh - Deploy Base application to storage server
#
# This script handles the complete deployment workflow:
# 1. Pushes local changes to origin
# 2. Pulls on storage server production directory (/home/user/base/)
# 3. Installs dependencies if needed
# 4. Rebuilds client if needed
# 5. Restarts PM2 services
#
# Usage:
#   ./cli/deploy-storage.sh           # Full deploy (pull, install, build, restart)
#   ./cli/deploy-storage.sh --quick   # Quick deploy (pull and restart only)
#   ./cli/deploy-storage.sh --build   # Build only (no git operations)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
REMOTE_HOST="storage"
REMOTE_PATH="/home/user/base"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
QUICK_MODE=false
BUILD_ONLY=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick) QUICK_MODE=true; shift ;;
        --build) BUILD_ONLY=true; shift ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

# Verify we're in the right directory
if [[ ! -f "$BASE_DIR/pm2.config.js" ]]; then
    log_error "Must be run from base repository root"
    exit 1
fi

cd "$BASE_DIR"

if [[ "$BUILD_ONLY" == "true" ]]; then
    log_info "Build-only mode: rebuilding on storage server..."
    ssh "$REMOTE_HOST" "source ~/.nvm/nvm.sh && cd $REMOTE_PATH && yarn build"
    log_info "Restarting base-api..."
    ssh "$REMOTE_HOST" "source ~/.nvm/nvm.sh && pm2 restart base-api"
    log_info "Build complete"
    exit 0
fi

# Check for uncommitted changes
if [[ -n "$(git status --porcelain)" ]]; then
    log_warn "You have uncommitted changes. Commit or stash them first."
    git status --short
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Push local changes
log_info "Pushing local changes to origin..."
if ! git push origin main 2>/dev/null; then
    log_warn "Nothing to push or push failed"
fi

# Pull on remote
log_info "Pulling changes on storage server..."
ssh "$REMOTE_HOST" "cd $REMOTE_PATH && git pull origin main"

if [[ "$QUICK_MODE" == "true" ]]; then
    log_info "Quick mode: skipping install and build"
else
    # Check if package.json changed (need yarn install)
    log_info "Checking for dependency changes..."
    DEPS_CHANGED=$(ssh "$REMOTE_HOST" "cd $REMOTE_PATH && git diff HEAD~1 --name-only 2>/dev/null | grep -E '^package.json$|^yarn.lock$'" || true)

    if [[ -n "$DEPS_CHANGED" ]]; then
        log_info "Dependencies changed, running yarn install..."
        ssh "$REMOTE_HOST" "source ~/.nvm/nvm.sh && cd $REMOTE_PATH && yarn install"
    fi

    # Check if client code changed (need yarn build)
    log_info "Checking for client changes..."
    CLIENT_CHANGED=$(ssh "$REMOTE_HOST" "cd $REMOTE_PATH && git diff HEAD~1 --name-only 2>/dev/null | grep -E '^client/|^webpack/'" || true)

    if [[ -n "$CLIENT_CHANGED" ]]; then
        log_info "Client code changed, running yarn build..."
        ssh "$REMOTE_HOST" "source ~/.nvm/nvm.sh && cd $REMOTE_PATH && yarn build"
    fi
fi

# Restart PM2
log_info "Restarting PM2 services..."
ssh "$REMOTE_HOST" "source ~/.nvm/nvm.sh && pm2 restart base-api"

# Verify deployment
log_info "Verifying deployment..."
sleep 3
STATUS=$(ssh "$REMOTE_HOST" "source ~/.nvm/nvm.sh && pm2 jlist 2>/dev/null | jq -r '.[] | select(.name==\"base-api\") | .pm2_env.status'" 2>/dev/null || echo "unknown")

if [[ "$STATUS" == "online" ]]; then
    log_info "Deployment successful! base-api is online"

    # Test the endpoint
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://base.tint.space/ 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" == "200" ]]; then
        log_info "Site is responding (HTTP $HTTP_CODE)"
    else
        log_warn "Site returned HTTP $HTTP_CODE"
    fi
else
    log_error "Deployment may have failed. Status: $STATUS"
    log_info "Check logs with: ssh storage 'tail -50 /home/user/logs/base-api-error.log'"
    exit 1
fi
