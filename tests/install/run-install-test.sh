#!/usr/bin/env bash
#
# Host-side launcher for the Base CLI install test.
# Builds a clean Docker container and runs the end-to-end test inside it.
#
# Usage:
#   ./tests/install/run-install-test.sh
#   BASE_URL=http://localhost:8080 ./tests/install/run-install-test.sh
#
# Environment variables:
#   BASE_URL    Override the download URL (default: https://base.tint.space)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="base-install-test"
BASE_URL="${BASE_URL:-https://base.tint.space}"

echo "Building clean test container..."
docker build -f "$SCRIPT_DIR/Dockerfile.clean" -t "$IMAGE_NAME" "$SCRIPT_DIR"

echo ""
echo "Running install test (BASE_URL=$BASE_URL)..."
echo ""

docker run --rm \
  -e "BASE_URL=$BASE_URL" \
  "$IMAGE_NAME"

exit_code=$?

if [ $exit_code -eq 0 ]; then
  echo ""
  echo "All install tests passed."
else
  echo ""
  echo "Some install tests failed (exit code: $exit_code)."
fi

exit $exit_code
