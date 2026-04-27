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
    "environment": "controlled_host" | "controlled_container" | "provider_hosted",
    "machine_id": "macbook" | "storage" | null,
    "container_runtime": "docker" | null,
    "container_name": "base-container" | "base-user-arrin" | null,
    "account_namespace": "fee.trace.wrap"
  }
}
```

`execution` MAY be `null` for the small set of legacy threads whose origin
cannot be classified from raw-data signals. Code that consumes `execution` must
tolerate this (treat null as host-fallback for routing).

`account_namespace` is an optional string; omit it when not applicable rather
than writing `null`.

## Environment Values

| Value | Meaning |
|-------|---------|
| `controlled_host` | Ran directly on a machine we own (no container) |
| `controlled_container` | Ran inside a container on a machine we own |
| `provider_hosted` | Ran on third-party infrastructure (ChatGPT API, claude.ai web, etc.) |

## Invariants

The factory `libs-server/threads/execution-attribution.mjs` is the only place
these invariants are constructed and enforced:

- `environment === 'controlled_host'` => `container_runtime === null` and `container_name === null`.
- `environment === 'controlled_container'` => both `container_runtime` and `container_name` are non-null.
- `environment === 'provider_hosted'` => `machine_id === null`, `container_runtime === null`, `container_name === null`.
- A `container_name` that starts with `base-user-` indicates per-user isolation.
- `machine_id` is `null` when `machine_registry` has no matching entry for the current host, or for `provider_hosted`.

## Examples

### Controlled host (macbook)

```json
{
  "environment": "controlled_host",
  "machine_id": "macbook",
  "container_runtime": null,
  "container_name": null,
  "account_namespace": "fee.trace.wrap"
}
```

### Shared container (storage)

```json
{
  "environment": "controlled_container",
  "machine_id": "storage",
  "container_runtime": "docker",
  "container_name": "base-container",
  "account_namespace": "fee.trace.wrap"
}
```

### Per-user container

```json
{
  "environment": "controlled_container",
  "machine_id": "storage",
  "container_runtime": "docker",
  "container_name": "base-user-arrin"
}
```

### Provider hosted (ChatGPT)

```json
{
  "environment": "provider_hosted",
  "machine_id": null,
  "container_runtime": null,
  "container_name": null
}
```

## Resume Permission Rule

The resume route (`POST /api/threads/:thread_id/resume`) decides authorization
in two steps, with no reference to `execution.environment` or `container_name`:

1. **Ownership check** via `validate_thread_ownership` -- if the requester
   wrote the thread, they may resume it.
2. **Permission fallback** via `check_thread_permission_for_user` -- a
   non-owner may resume only when an applicable permission grant (including
   `public_read`) allows it.

Per-user isolation is governed by container dispatch, not by ownership. After
the permission decision passes, the route derives a local routing variable
from `execution.container_name` to choose the correct container target.

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

## Overwrite Guards

`update_thread_metadata` applies two-step logic when deciding whether to
write an incoming `execution_overrides`:

1. **Downgrade guard** (always enforced): if the existing stamp is per-user
   container and the incoming is not, refuse and log.
2. **Equality guard** (always enforced): if both existing and incoming are
   non-null and differ, refuse and log. There is no escape hatch.

When neither guard fires, the incoming attribution is written when non-null,
or the existing value is preserved when incoming is null.

## Container Runtime Selection

`container_runtime` in the stored attribution is whichever runtime
`libs-server/container/runtime-config.mjs` resolved at write time. Resolution
precedence is:

1. `machine_registry[current_machine_id].container_runtime`
2. `config.container_runtime`
3. `'docker'`

Per-machine values win over the global so a single deployment file can mix
host platforms.

## Claude Import Resolver

For bulk Claude session imports, attribution is resolved per-session by
`libs-server/integrations/claude/claude-attribution-resolver.mjs`. It maps
`raw_session.metadata.file_path` against `config.machine_registry[*].claude_paths`
using a longest-prefix match across all machines in the registry (not just
the current host):

- `host_config_dir.<account>` -> `controlled_host`, account_namespace from `<account>`
- `admin_data_dir.<account>` -> `controlled_container`, container_name=`base-container`
- `user_data_dirs.<username>.<account>` -> `controlled_container`, container_name=`base-user-<username>`

Paths under archive prefixes return `null` (excluded — must re-import from raw source).

## Migration

The one-shot `cli/migrate-thread-execution-attribution.mjs` script classified
every historical thread from the `file_path` recorded in
`raw-data/claude-metadata.json` and removed the legacy
`source.execution_mode`, `source.container_user`, and `source.container_name`
fields. Threads whose origin could not be classified, or whose metadata had
pre-existing schema drift, were marked `review_needed: true` and excluded
from the bulk commit.

### Lessons learned for future one-shot migrations

When a `file_path` matched none of the classifier's regexes (e.g. thread
`ec67f399` with `/tmp/repro-timeline/...`), the script silently skipped the
thread -- no Written, no Unchanged, no Abort, no raw-data-missing bucket. A
correct classifier should return an explicit `{kind: 'ambiguous'}` for
unmatched paths and route the thread into the `review_needed` quarantine so
it is never invisible. Future migrations that iterate over historical raw
data should preserve this invariant: every input must land in exactly one
accounted-for output bucket.
