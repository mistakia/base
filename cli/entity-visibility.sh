#!/usr/bin/env bash

# Entity Visibility CLI Tool (Bash wrapper)
# Purpose: Invoke the Node.js implementation in entity-visibility.mjs

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "${script_dir}/entity-visibility.mjs" "$@"


