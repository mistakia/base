---
title: Cross-Machine Sessions
type: text
description: >-
  Defines how Base sessions move between machines using execution modes, thread git sync, and
  session state restoration.
base_uri: sys:system/text/cross-machine-sessions.md
created_at: '2026-02-11T01:46:31.000Z'
entity_id: 53eaedfd-e94a-4c58-9bf1-dea2953d95c0
observations:
  - '[execution-mode] Commands and Claude sessions can run on host or inside base-container'
  - '[sync] Thread continuity is driven by git sync in the thread submodule'
  - '[restore] Resume flow restores JSONL/todos/plans before launching Claude CLI'
public_read: true
relations:
  - relates_to [[sys:system/text/session-orchestrator.md]]
  - relates_to [[sys:system/text/background-services.md]]
  - relates_to [[sys:system/schema/scheduled-command.md]]
updated_at: '2026-02-11T01:46:31.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:35:28.869Z'
---

# Cross-Machine Sessions

Base supports thread continuity across machines by combining queued execution,
git-based thread sync, and state restoration before resume.

## Execution Modes

- `host`: Execute directly on the host machine.
- `container`: Execute inside `base-container` via `docker exec`.

Execution mode is available for:

- Claude session creation/resume job queue
- CLI queue jobs, including scheduled commands

## Sync Model

Thread continuity is based on git sync of `thread/` data:

1. Session hooks write thread raw-data and metadata.
2. `push-threads.sh` publishes changes to remote storage.
3. `pull-threads.sh` fetches/rebases changes onto other machines.

This is the primary sync mechanism for cross-machine session continuity.

## Resume Flow

When resuming a thread with a known Claude session ID, Base restores state to
the active execution environment before invoking Claude CLI:

1. Restore session JSONL to container `~/.claude/projects/...`
2. Restore todos to container `~/.claude/todos`
3. Restore plan file to container `~/.claude/plans`
4. Spawn Claude CLI in the selected execution mode

## Manual Recovery

`sync-sessions` is a recovery-only path for syncing session JSONL files between
machines when container-local session cache files are missing.
