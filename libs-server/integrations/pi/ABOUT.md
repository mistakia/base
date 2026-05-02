---
title: Pi Integration
type: text
description: >-
  Pi coding-agent session import provider: 5-file module split
  (provider/normalize/helpers/tree/branch-linker), one-thread-per-branch fan-out, and the
  cross-thread linker module boundary.
base_uri: sys:libs-server/integrations/pi/ABOUT.md
created_at: '2026-05-02T22:14:48.681Z'
entity_id: 9b117254-d454-436b-9611-b14cf4e5b56a
public_read: false
relations:
  - relates [[sys:system/text/session-lifecycle-reference.md]]
updated_at: '2026-05-02T22:14:48.681Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Pi Integration

Importer for [Pi coding-agent](https://github.com/badlogic/pi-mono) JSONL sessions. Targets the consolidated 5-type timeline schema and creates one thread per branch from Pi's tree-structured sessions.

## Reference

- Canonical session-format spec: <https://raw.githubusercontent.com/badlogic/pi-mono/refs/heads/main/packages/coding-agent/docs/session-format.md> (rendered: <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session-format.md>)
- Pi repo: <https://github.com/badlogic/pi-mono>

## Pi v3 Envelope (read this before editing the normalizer)

Pi v3 message entries wrap their payload under `entry.message`:

```json
{
  "type": "message",
  "id": "...",
  "parentId": "...",
  "timestamp": "...",
  "message": {
    "role": "user|assistant|toolResult|bashExecution|custom|branchSummary|compactionSummary",
    "content": "string | TextContent[] | ImageContent[] | ThinkingContent[] | ToolCall[]",
    "model": "...",
    "provider": "...",
    "toolCallId": "...",
    "isError": false,
    "usage": {
      "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 0,
      "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0 }
    }
  }
}
```

Non-message entries (`model_change`, `thinking_level_change`, `compaction`, `branch_summary`, `custom`, `custom_message`, `label`, `session_info`) carry their fields at the top level. `model_change` uses `modelId` and `provider`.

Reading these fields directly off `entry` (e.g. `entry.role`, `entry.content`, `entry.usage.inputTokens`) silently drops every message; the normalizer always reads `entry.message?.X ?? entry.X` and uses the spec's exact key names (`input` / `output` / `cacheRead` / `cacheWrite`).

## Module Split

| Module                     | Responsibility                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pi-session-provider.mjs`  | `SessionProviderBase` implementation. Discovers files, parses headers, yields one raw session per branch from `find_sessions` / `stream_sessions`.      |
| `normalize-pi-session.mjs` | Per-branch normalization. Two-level dispatch (entry type, then role for `message`). Per-turn token/cost stamping. `parse_mode='full'`.                  |
| `pi-session-helpers.mjs`   | JSONL parsing, header validation, version migration (v1/v2/v3), file discovery.                                                                         |
| `pi-tree.mjs`              | Tree building (id/parentId), leaf detection, branch extraction, branch-point identification (child-count, O(n)).                                        |
| `pi-branch-linker.mjs`     | Cross-thread post-processing. Adds `branched_from` relations between sibling branches; backfills `branch_thread_id` on `branch_point` timeline entries. |

## Why the Linker Lives in the CLI, Not the Provider

`SessionProviderBase` is per-session by contract (`find_sessions`, `normalize_session`, `validate_session` operate on one raw session at a time). Branch linking is inherently cross-session: it needs the full set of created/updated threads from a Pi file before it can add `branched_from` relations or resolve sibling thread ids onto `branch_point` entries. Putting the linker on the provider class would either require per-session buffering (changing the streaming contract) or duplicate state. The dedicated module is invoked from `cli/convert-external-sessions.mjs` after `create_threads_from_session_provider` returns.

## Raw Data

Pi has no `save_raw_*` persister yet. `PiSessionProvider.supports_raw_data` returns `false`, so the dispatcher passes `null` for `raw_session_data` on both CREATE and UPDATE paths and `verify_thread_directory_integrity` does not require a `raw-data/` directory. A `case 'pi': // no-op` arm in `save_raw_session_data` is defense in depth. Flip the getter to `true` once a Pi raw-data persister exists.

## Branch Identity

Per-branch `session_id` is `<header.id>-branch-<index>`. Branch index 0 is the most recent leaf by timestamp (the primary branch). Sibling branches share the Pi `header.id`; their thread ids are deterministic via `generate_thread_id_from_session`, so re-imports converge on the same threads.

## Linker Limitations

- Multi-sibling backfill (3+ branches per session) is reported as `branch_points_skipped_multi_sibling` rather than resolved -- single-sibling resolution is the dominant Pi flow today.
- Forked-session linkage (`header.parentSession`) requires reading the parent `.jsonl` to recover its `header.id` and is reported as `parent_session_links_deferred`.
