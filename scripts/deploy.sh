#!/usr/bin/env bash
#
# Deploy Base CLI releases and content to base.tint.space
#
# Prerequisites:
#   - SSH access to storage server (ssh alias: storage)
#   - Bun installed locally for building
#
# Usage:
#   ./scripts/deploy.sh                    # Full deploy (build + system + content)
#   ./scripts/deploy.sh --skip-build       # Deploy existing dist/ without rebuilding
#   ./scripts/deploy.sh --system-only      # Only sync system content
#   ./scripts/deploy.sh --content-only     # Only sync installable content
#
# The hosting directory on the server:
#   /mnt/md0/base-hosting/
#   ├── install.sh
#   ├── releases/latest/
#   │   ├── version.json
#   │   └── base-{platform}-{arch}
#   ├── system/
#   │   ├── manifest.json
#   │   └── {schema,workflow,guideline,text}/
#   ├── extension/
#   │   └── {name}/manifest.json + files
#   ├── workflow/
#   │   └── {name}.md
#   └── guideline/
#       └── {name}.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
SSH_HOST="${DEPLOY_HOST:-storage}"
REMOTE_BASE="/home/user/base-hosting"

# User-base directory (parent of repository/active/base)
USER_BASE="$(cd "$PROJECT_ROOT/../../.." && pwd)"

SKIP_BUILD=false
SYSTEM_ONLY=false
CONTENT_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --system-only) SYSTEM_ONLY=true ;;
    --content-only) CONTENT_ONLY=true ;;
    --help)
      echo "Usage: deploy.sh [--skip-build] [--system-only] [--content-only]"
      exit 0
      ;;
  esac
done

info() { echo -e "\033[1m$*\033[0m"; }
success() { echo -e "\033[32m$*\033[0m"; }
error() { echo -e "\033[31merror:\033[0m $*" >&2; }

# Ensure remote directory structure exists
setup_remote() {
  info "Setting up remote directory structure..."
  ssh "$SSH_HOST" "mkdir -p $REMOTE_BASE/{releases/latest,system,extension,workflow,guideline,skill,hook}"
}

# Build binaries for all platforms
build_binaries() {
  if [ "$SKIP_BUILD" = true ]; then
    info "Skipping build (--skip-build)"
    if [ ! -d "$DIST_DIR" ] || [ -z "$(ls -A "$DIST_DIR" 2>/dev/null)" ]; then
      error "No dist/ directory found. Run without --skip-build first."
      exit 1
    fi
    return
  fi

  info "Building binaries for all platforms..."
  bun "$SCRIPT_DIR/build.mjs" --all

  if [ ! -f "$DIST_DIR/version.json" ]; then
    error "Build failed: no version.json produced"
    exit 1
  fi
}

# Deploy binaries and install script
deploy_releases() {
  info "Deploying release binaries..."

  # Upload all binaries and version.json
  rsync -avz --progress "$DIST_DIR/" "$SSH_HOST:$REMOTE_BASE/releases/latest/"

  # Upload install script to root
  scp "$SCRIPT_DIR/install.sh" "$SSH_HOST:$REMOTE_BASE/install.sh"

  local version
  version=$(bun -e "console.log(JSON.parse(require('fs').readFileSync('$DIST_DIR/version.json','utf8')).version || 'dev')")
  success "Release deployed: v${version}"
}

# Generate and deploy system content
deploy_system_content() {
  info "Generating system content manifest..."

  local system_dist="$DIST_DIR/system"
  mkdir -p "$system_dist"

  # Generate manifest
  bun "$SCRIPT_DIR/generate-system-manifest.mjs" --output "$system_dist/manifest.json"

  # Copy system files to dist
  rsync -a --include='*/' --include='*.md' --exclude='*' \
    "$PROJECT_ROOT/system/" "$system_dist/"

  # Upload to server
  info "Deploying system content..."
  rsync -avz --delete "$system_dist/" "$SSH_HOST:$REMOTE_BASE/system/"

  success "System content deployed"
}

# Generate and deploy installable content from user-base
deploy_installable_content() {
  info "Deploying installable content..."

  local content_dist="$DIST_DIR/content"
  rm -rf "$content_dist"
  mkdir -p "$content_dist"

  # Deploy extensions that have extension.md manifests
  if [ -d "$USER_BASE/extension" ]; then
    for ext_dir in "$USER_BASE/extension"/*/; do
      [ -d "$ext_dir" ] || continue
      local ext_name
      ext_name="$(basename "$ext_dir")"

      # Only deploy extensions that have an extension.md
      if [ -f "$ext_dir/extension.md" ]; then
        info "  Packaging extension: $ext_name"
        bun "$SCRIPT_DIR/generate-content-manifest.mjs" "$ext_dir" "$content_dist/extension/$ext_name"
      fi
    done

    if [ -d "$content_dist/extension" ]; then
      rsync -avz "$content_dist/extension/" "$SSH_HOST:$REMOTE_BASE/extension/"
    fi
  fi

  # Deploy workflows (individual .md files)
  if [ -d "$USER_BASE/workflow" ]; then
    rsync -avz --include='*.md' --exclude='*' \
      "$USER_BASE/workflow/" "$SSH_HOST:$REMOTE_BASE/workflow/"
  fi

  # Deploy guidelines (individual .md files)
  if [ -d "$USER_BASE/guideline" ]; then
    rsync -avz --include='*.md' --exclude='*' \
      "$USER_BASE/guideline/" "$SSH_HOST:$REMOTE_BASE/guideline/"
  fi

  success "Installable content deployed"
}

# Main
if [ "$SYSTEM_ONLY" = true ]; then
  setup_remote
  deploy_system_content
elif [ "$CONTENT_ONLY" = true ]; then
  setup_remote
  deploy_installable_content
else
  setup_remote
  build_binaries
  deploy_releases
  deploy_system_content
  deploy_installable_content
fi

echo
success "Deploy complete."
