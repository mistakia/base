---
title: Session Orchestrator
type: text
description: >-
  Describes Base's role as a session orchestrator that manages, standardizes, and records sessions
  across any session runner, model, or execution environment.
base_uri: sys:system/text/session-orchestrator.md
created_at: '2026-02-10T23:30:00.000Z'
entity_id: 055d2a28-9338-4f90-a228-e702dd23cd58
observations:
  - >-
    [architecture] Base does not run sessions internally; it manages and standardizes external
    session runners
  - '[design] Session runner agnostic and execution environment agnostic by design'
  - '[integration] Supports spawned sessions (CLI) and imported sessions (after-the-fact)'
public_read: true
relations:
  - relates_to [[sys:system/text/execution-threads.md]]
  - relates_to [[sys:system/text/workflow.md]]
  - relates_to [[sys:system/text/system-design.md]]
updated_at: '2026-02-10T23:30:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:37:56.978Z'
---

# Session Orchestrator

Base is a session orchestrator and record keeper. It does not run sessions internally. Instead, Base manages and standardizes sessions from external session runners and execution environments.

## Design Principles

Base is designed to be agnostic across three axes:

- **Session runner agnostic**: Interface with any agentic session runner (Claude Code, Cursor, ChatGPT, Pi, or future runners). Adding a new runner requires only a session provider adapter.
- **Model agnostic**: Sessions can use any inference model. Base tracks model usage in thread metadata without coupling to any specific model or API.
- **Execution environment agnostic**: Sessions can run on the host machine, in Docker containers, or in cloud sandbox providers. Base manages the session lifecycle regardless of where it runs.

## Architecture

Base manages sessions through two mechanisms:

1. **Spawned Sessions**: Base launches session runner processes (e.g., Claude Code CLI) via the command queue, with hooks that report session events back to Base for thread creation and tracking.

2. **Imported Sessions**: Sessions from external tools (Claude, Cursor, ChatGPT, Pi) are imported after the fact through the session provider pipeline, normalized to the standard thread format.

In both cases, Base handles orchestration -- scheduling, context handoff, metadata tracking, cost calculation, and analysis -- while the session runner handles the actual interaction loop.

## Session Providers

A session provider is an adapter that bridges a specific session runner to Base's standardized thread format. Each provider implements `SessionProviderBase` and handles:

- **Session discovery**: Finding sessions to import from runner-specific storage
- **Normalization**: Converting runner-specific formats to the standard timeline format
- **Metadata extraction**: Pulling token counts, models, duration, and other metrics

### Current Providers

| Provider  | Session Runner  | Format                    |
| --------- | --------------- | ------------------------- |
| `claude`  | Claude Code CLI | JSONL transcript files    |
| `cursor`  | Cursor IDE      | SQLite database           |
| `chatgpt` | ChatGPT         | JSON data export          |
| `pi`      | Pi AI           | JSONL with tree structure |

New providers can be added by implementing `SessionProviderBase` and registering in the provider map. See the development guidelines in [[sys:system/text/execution-threads.md]].

## Thread Metadata

All sessions produce thread metadata with a unified `source` object:

```yaml
source:
  provider: claude | pi | cursor | chatgpt
  session_id: string
  session_path: string
  imported_at: string
  provider_metadata: object
  raw_data_saved: boolean
```

The `source` object replaces the previous `session_provider` and `external_session` fields, providing a single location for all session origin data.

## Execution Flow

### Spawned Sessions

1. User or schedule triggers a session via API or CLI
2. Base enqueues a CLI command (e.g., `claude --session-id <id>`)
3. External CLI executes with hooks configured to call back to Base
4. Session start hook creates the thread and registers it as active
5. Session end hook finalizes metadata, commits thread data, queues analysis

### Imported Sessions

1. User runs import CLI (`convert-external-sessions.mjs`)
2. Provider discovers sessions from its storage location
3. Each session is normalized to the standard timeline format
4. Thread is created with metadata and timeline data
5. Thread is queued for metadata analysis (title, relations, tags)

## Key Components

| Component               | Path                                                        | Purpose                                   |
| ----------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| Session providers       | `libs-server/integrations/{provider}/`                      | Provider-specific import logic            |
| Provider base class     | `libs-server/integrations/thread/session-provider-base.mjs` | Abstract base for all providers           |
| Thread creation         | `libs-server/integrations/thread/create-from-session.mjs`   | Builds threads from normalized sessions   |
| Import CLI              | `cli/convert-external-sessions.mjs`                         | User-facing session import tool           |
| Active session tracking | `libs-server/active-sessions/`                              | Redis-backed tracking of running sessions |
| Thread cost calculator  | `libs-server/utils/thread-cost-calculator.mjs`              | Token-based cost calculation              |
