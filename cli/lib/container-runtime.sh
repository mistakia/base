#!/bin/bash
# container-runtime.sh - Resolve container runtime binary + compose command
#
# Source this file to get CONTAINER_CMD and CONTAINER_COMPOSE_CMD environment
# variables. The values are resolved by invoking node against the same
# runtime-config.mjs module the server uses, so the precedence rules
# (per-machine override -> global config -> 'docker') stay in one place.
#
# Avoids a jq dependency by piping JS straight into `node -e`.
#
# Usage:
#   source "$(dirname "$0")/lib/container-runtime.sh"
#   $CONTAINER_CMD ps
#   $CONTAINER_COMPOSE_CMD -f compose.yml up -d

if [ -n "${CONTAINER_RUNTIME_SH_LOADED:-}" ]; then
    return 0
fi
export CONTAINER_RUNTIME_SH_LOADED=1

_resolve_container_runtime_via_node() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local base_dir
    base_dir="$(cd "$script_dir/../.." && pwd)"

    node --input-type=module -e "
import('$base_dir/libs-server/container/runtime-config.mjs')
  .then((m) => { process.stdout.write(m.get_container_runtime_name()) })
  .catch((e) => { process.stderr.write('runtime-config resolve failed: ' + e.message); process.exit(1) })
" 2>/dev/null || echo "docker"
}

# Resolve once and export. Fall back to 'docker' if node fails (e.g. invoked
# from a minimal recovery shell).
CONTAINER_CMD="$(_resolve_container_runtime_via_node)"
if [ -z "$CONTAINER_CMD" ]; then
    CONTAINER_CMD="docker"
fi
CONTAINER_COMPOSE_CMD="$CONTAINER_CMD compose"

export CONTAINER_CMD
export CONTAINER_COMPOSE_CMD
