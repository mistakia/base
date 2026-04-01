#!/usr/bin/env bash
#
# Base CLI Installer
#
# One-liner install:
#   curl -fsSL https://base.tint.space/install.sh | bash
#
# What it does:
#   1. Detects platform (darwin/linux) and architecture (arm64/x64)
#   2. Downloads compiled binary from base.tint.space/releases/latest/
#   3. Places binary at ~/.base/bin/base
#   4. Adds ~/.base/bin to PATH in shell profile
#   5. Runs `base init` interactively
#
# Environment variables:
#   BASE_INSTALL_DIR  Override install directory (default: ~/.base)
#   BASE_VERSION      Override version (default: latest)
#   SKIP_INIT         Set to 1 to skip running `base init`

set -euo pipefail

BASE_URL="${BASE_URL:-https://base.tint.space}"
INSTALL_DIR="${BASE_INSTALL_DIR:-$HOME/.base}"
BIN_DIR="$INSTALL_DIR/bin"
VERSION="${BASE_VERSION:-latest}"

# Colors (only if terminal supports them)
if [ -t 1 ]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  RESET='\033[0m'
  GREEN='\033[32m'
  RED='\033[31m'
else
  BOLD='' DIM='' RESET='' GREEN='' RED=''
fi

info() { echo -e "${BOLD}$*${RESET}"; }
success() { echo -e "${GREEN}$*${RESET}"; }
error() { echo -e "${RED}error:${RESET} $*" >&2; }
dim() { echo -e "${DIM}$*${RESET}"; }

# Detect platform
detect_platform() {
  local os arch

  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)
      error "Unsupported operating system: $(uname -s)"
      exit 1
      ;;
  esac

  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *)
      error "Unsupported architecture: $(uname -m)"
      exit 1
      ;;
  esac

  echo "${os}-${arch}"
}

# Detect shell profile file
detect_profile() {
  local shell_name
  shell_name="$(basename "${SHELL:-/bin/bash}")"

  case "$shell_name" in
    zsh)
      if [ -f "$HOME/.zshrc" ]; then
        echo "$HOME/.zshrc"
      else
        echo "$HOME/.zprofile"
      fi
      ;;
    bash)
      if [ -f "$HOME/.bashrc" ]; then
        echo "$HOME/.bashrc"
      elif [ -f "$HOME/.bash_profile" ]; then
        echo "$HOME/.bash_profile"
      else
        echo "$HOME/.profile"
      fi
      ;;
    fish)
      echo "$HOME/.config/fish/config.fish"
      ;;
    *)
      echo "$HOME/.profile"
      ;;
  esac
}

# Download with curl or wget
download() {
  local url="$1" output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$output"
  else
    error "Neither curl nor wget found. Please install one and try again."
    exit 1
  fi
}

main() {
  info "Installing Base CLI..."
  echo

  # Detect platform
  local platform
  platform="$(detect_platform)"
  dim "Platform: $platform"

  # Create directories
  mkdir -p "$BIN_DIR"
  mkdir -p "$INSTALL_DIR/system"

  # Download binary
  local binary_name="base-${platform}"
  local download_url="${BASE_URL}/releases/${VERSION}/${binary_name}"
  local binary_path="${BIN_DIR}/base"

  info "Downloading base binary..."
  dim "  ${download_url}"

  local tmp_file
  tmp_file="$(mktemp)"
  trap 'rm -f "$tmp_file"' EXIT

  if ! download "$download_url" "$tmp_file"; then
    error "Failed to download binary from ${download_url}"
    error "Check your internet connection and try again."
    exit 1
  fi

  # Install binary
  mv "$tmp_file" "$binary_path"
  chmod +x "$binary_path"
  trap - EXIT

  success "Binary installed to ${binary_path}"

  # Download version.json
  local version_url="${BASE_URL}/releases/${VERSION}/version.json"
  download "$version_url" "$INSTALL_DIR/version.json" 2>/dev/null || true

  # Add to PATH if not already there
  if ! echo "$PATH" | tr ':' '\n' | grep -q "^${BIN_DIR}$"; then
    local profile
    profile="$(detect_profile)"

    local path_line="export PATH=\"${BIN_DIR}:\$PATH\""

    if [ -f "$profile" ] && grep -q "$BIN_DIR" "$profile" 2>/dev/null; then
      dim "PATH already configured in ${profile}"
    else
      echo >> "$profile"
      echo "# Base CLI" >> "$profile"
      echo "$path_line" >> "$profile"
      success "Added ${BIN_DIR} to PATH in ${profile}"
    fi

    # Export for current session
    export PATH="${BIN_DIR}:$PATH"
  fi

  echo
  success "Base CLI installed successfully!"
  echo
  dim "  Version: $(${binary_path} --version 2>/dev/null || echo 'unknown')"
  dim "  Binary:  ${binary_path}"
  echo

  # Run init unless skipped
  if [ "${SKIP_INIT:-0}" != "1" ]; then
    info "Running initial setup..."
    echo
    "${binary_path}" init
  else
    dim "Skipping initial setup (SKIP_INIT=1)"
    echo
    info "Run 'base init' to set up your user-base directory."
  fi
}

main "$@"
