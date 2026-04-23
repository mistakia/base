---
title: libs-server/container
type: text
description: >-
  Container-runtime-agnostic helpers (formerly libs-server/docker). Owns runtime selection,
  shared path translation, and safe-stop orchestration.
base_uri: sys:libs-server/container/ABOUT.md
public_read: true
relations:
  - relates_to [[sys:system/text/thread-execution-attribution.md]]
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# libs-server/container

Runtime-agnostic helpers for the container subsystem. The directory was
renamed from `libs-server/docker` once `runtime-config.mjs` made the binary
selection a first-class concern.

## Modules

- `execution-mode.mjs` -- generic constants and host/container path
  translation (`translate_to_container_path`, `translate_to_host_path`).
- `runtime-config.mjs` -- resolves the current container runtime binary
  and compose command. Single source of read for runtime selection.
- `safe-container-stop.mjs` -- orchestrates safe stops with active-session
  detection.

## Runtime Selection

`get_container_runtime_name()` returns the runtime binary that every
server-side spawn/exec call site must pass to `child_process`. Resolution
precedence is:

1. `machine_registry[current_machine_id].container_runtime`
2. `config.container_runtime` (top-level in `config/config.json`)
3. `'docker'`

The per-machine value wins so a single deployment file can mix host
platforms (e.g. docker on linux, podman on macOS).

`get_container_compose_cmd()` returns the matching compose command (e.g.
`'docker compose'`, `'podman compose'`). Callers that need argv split it
themselves.

Shell scripts source `cli/lib/container-runtime.sh`, which exports
`CONTAINER_CMD` and `CONTAINER_COMPOSE_CMD` resolved by invoking
`runtime-config.mjs` via `node -e` (no jq dependency).

## Adding a Runtime

When a new runtime appears that cannot be parameterized at the binary
level (e.g. one that requires a different `exec` syntax or lacks `top`),
extract a thin interface here, place per-runtime adapters in subfolders,
and update the resolver to dispatch on the resolved name. Until then,
parameterizing the binary at the call site is sufficient and keeps
one-implementation interfaces out of the codebase.

The current runtime catalog: `docker` (only fully-supported value as of
April 2026). `podman` and `nerdctl` share enough CLI shape to work in
practice; `apple/container` is not viable until it exposes `exec`,
`-u`, and `top`.
