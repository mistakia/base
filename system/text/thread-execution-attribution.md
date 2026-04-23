---
title: Thread Execution Attribution
type: text
description: >-
  Canonical specification for the thread execution-attribution model -- where and how a session
  ran -- plus the resume-permission rule built on top of it.
base_uri: sys:system/text/thread-execution-attribution.md
public_read: true
relations:
  - relates_to [[sys:system/text/session-lifecycle-reference.md]]
  - relates_to [[user:task/base/formalize-thread-execution-attribution.md]]
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Thread Execution Attribution

Every thread records where and how its session executed in a single top-level
`execution` object on its `metadata.json`. This object is the source of truth
for routing decisions (path translation, queue payload shape) and feeds the
resume-permission model.

## Canonical Shape

```json
{
  "execution": {
    "mode": "host" | "container",
    "machine_id": "macbook" | "storage" | null,
    "container_runtime": "docker" | null,
    "container_name": "base-container" | "base-user-arrin" | null
  }
}
```

`execution` MAY be `null` for the small set of legacy threads whose origin
cannot be classified from raw-data signals. Code that consumes `execution` must
tolerate this (treat null as host-fallback for routing).

## Invariants

The factory `libs-server/threads/execution-attribution.mjs` is the only place
these invariants are constructed and enforced:

- `mode === 'host'` => `container_runtime === null` and `container_name === null`.
- `mode === 'container'` => both `container_runtime` and `container_name` are non-null.
- A `container_name` that starts with `base-user-` indicates per-user isolation.
- `machine_id` is `null` only when `machine_registry` has no matching entry for
  the current host.

## Examples

### Host (macbook)

```json
{
  "mode": "host",
  "machine_id": "macbook",
  "container_runtime": null,
  "container_name": null
}
```

### Shared container (storage)

```json
{
  "mode": "container",
  "machine_id": "storage",
  "container_runtime": "docker",
  "container_name": "base-container"
}
```

### Per-user container

```json
{
  "mode": "container",
  "machine_id": "storage",
  "container_runtime": "docker",
  "container_name": "base-user-arrin"
}
```

## Resume Permission Rule

The resume route (`POST /api/threads/:thread_id/resume`) decides authorization
in two steps, with no reference to `execution.mode` or `container_name`:

1. **Ownership check** via `validate_thread_ownership` -- if the requester
   wrote the thread, they may resume it.
2. **Permission fallback** via `check_thread_permission_for_user` -- a
   non-owner may resume only when an applicable permission grant (including
   `public_read`) allows it.

Per-user isolation is governed by container dispatch, not by ownership. After
the permission decision passes, the route derives a local routing variable
from `execution.container_name` to choose the correct container target.

A consequence: a host thread owned by a user who later received `thread_config`
becomes resumable by that user (it would have been blocked under the previous
mode-string model). This is strictly an improvement.

## Stamping

Threads are stamped with `execution` at three points:

1. **Creation** (`/create-session`) -- the local `execution_mode` routing
   variable is derived from `thread_config` presence; the helper builds the
   stored `execution` from there.
2. **SessionStart hook** (`/session-status`, `session_id` first written) --
   if the owner has `thread_config` and the thread was created without an
   execution stamp, one is added at this point.
3. **Sync paths** (`/sync-user-session`, `sync_session_fallback`) -- carry
   an `execution_overrides` object that flows through `update_thread_metadata`.
   The integration layer guards against downgrading a per-user-container stamp
   to a less-specific one.

## Container Runtime Selection

`container_runtime` in the stored attribution is whichever runtime
`libs-server/container/runtime-config.mjs` resolved at write time. Resolution
precedence is:

1. `machine_registry[current_machine_id].container_runtime`
2. `config.container_runtime`
3. `'docker'`

Per-machine values win over the global so a single deployment file can mix
host platforms.

## Migration

The one-shot `cli/migrate-thread-execution-attribution.mjs` script classified
every historical thread from the `file_path` recorded in
`raw-data/claude-metadata.json` and removed the legacy
`source.execution_mode`, `source.container_user`, and `source.container_name`
fields. Threads whose origin could not be classified, or whose metadata had
pre-existing schema drift, were marked `review_needed: true` and excluded
from the bulk commit.
