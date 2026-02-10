---
title: Session Orchestrator
type: text
description: >-
  Describes Base's role as a session orchestrator that spawns, imports, and records agent sessions
  from external providers.
base_uri: sys:system/text/session-orchestrator.md
created_at: '2026-02-10T23:30:00.000Z'
entity_id: 055d2a28-9338-4f90-a228-e702dd23cd58
observations:
  - '[architecture] Base orchestrates sessions rather than executing agent logic internally'
  - '[design] Session providers are the engine choice; Base normalizes all sessions to a common thread format'
  - '[integration] Supports spawned sessions (CLI) and imported sessions (after-the-fact)'
relations:
  - relates_to [[sys:system/text/execution-threads.md]]
  - relates_to [[sys:system/text/workflow.md]]
  - relates_to [[sys:system/text/system-design.md]]
updated_at: '2026-02-10T23:30:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Session Orchestrator

Base functions as a session orchestrator and record keeper. Rather than executing agent logic internally, Base delegates execution to external session providers and focuses on session lifecycle management, recording, and analysis.

## Architecture

Base manages agent sessions through two mechanisms:

1. **Spawned Sessions**: Base launches external CLI processes (e.g., Claude Code) via the command queue, with hooks that report session events back to Base for thread creation and tracking.

2. **Imported Sessions**: Sessions from external tools (Claude, Cursor, OpenAI, Pi) are imported after the fact through the session provider pipeline, normalized to the standard thread format.

In both cases, the session provider is the "engine" choice. Base handles orchestration: scheduling, context handoff, metadata tracking, cost calculation, and analysis.

## Session Providers

Each provider implements `SessionProviderBase` and handles:

- **Session discovery**: Finding sessions to import from provider-specific storage
- **Normalization**: Converting provider-specific formats to the standard timeline format
- **Metadata extraction**: Pulling token counts, models, duration, and other metrics

### Supported Providers

| Provider | Source | Format |
|----------|--------|--------|
| `claude` | Claude Code CLI sessions | JSONL transcript files |
| `cursor` | Cursor IDE conversations | SQLite database |
| `openai` | ChatGPT conversations | JSON data export |
| `pi` | Pi AI sessions | JSONL with tree structure |

## Thread Metadata

All sessions produce thread metadata with a unified `source` object:

```yaml
source:
  provider: claude | pi | cursor | openai
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

| Component | Path | Purpose |
|-----------|------|---------|
| Session providers | `libs-server/integrations/{provider}/` | Provider-specific import logic |
| Provider base class | `libs-server/integrations/thread/session-provider-base.mjs` | Abstract base for all providers |
| Thread creation | `libs-server/integrations/thread/create-from-session.mjs` | Builds threads from normalized sessions |
| Import CLI | `cli/convert-external-sessions.mjs` | User-facing session import tool |
| Active session tracking | `libs-server/active-sessions/` | Redis-backed tracking of running sessions |
| Thread cost calculator | `libs-server/utils/thread-cost-calculator.mjs` | Token-based cost calculation |
