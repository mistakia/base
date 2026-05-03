---
title: Execution Threads
type: text
description: >-
  Defines execution threads as the unified session format for conversations and agentic loops
  across any session runner and execution environment.
base_uri: sys:system/text/execution-threads.md
created_at: '2025-05-27T18:10:20.241Z'
entity_id: 576c86bd-3ff4-4d88-b246-f168f3f11700
observations:
  - >-
    [design] A thread represents a session; Base is session runner agnostic and execution
    environment agnostic
  - >-
    [architecture] Unified timeline structure enables consistent handling across any session
    runner
  - >-
    [integration] Base does not run sessions internally; it manages and standardizes sessions
    from external runners
  - '[focus] Agentic loops are the primary use case, with conversations as a secondary pattern'
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/workflow.md]]
  - relates_to [[sys:system/text/session-orchestrator.md]]
  - relates_to [[sys:system/text/session-lifecycle-reference.md]]
  - relates_to [[sys:system/text/git-operations.md]]
updated_at: '2026-01-05T19:24:56.466Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Execution Threads

A thread represents a session -- a conversation or agentic loop. Base is designed to be session runner agnostic and execution environment agnostic: every thread has standardized metadata, timeline, and analysis data regardless of which runner produced it or where it ran.

## Terminology

- **Thread / Session**: A thread represents a session -- the two terms refer to the same concept. "Thread" is the system's name for the data structure stored on disk (`user:thread/{thread_id}/`) containing `metadata.json`, `timeline.jsonl`, and optional `raw-data/`. The term "thread" is used instead of "session" to avoid confusion with HTTP sessions or authentication sessions.
- **Session runner**: The tool that executes the interaction loop (e.g., Claude Code, Cursor, ChatGPT, Pi). Base does not run sessions internally -- it manages and standardizes sessions produced by external runners.
- **Execution environment**: Where a session runner operates -- on the host machine, in a Docker container, or in a cloud sandbox. Base is agnostic to the execution environment.
- **Provider**: A Base adapter that bridges a specific session runner to the standardized thread format. Each provider handles discovery, normalization, and metadata extraction for its runner.

## Definition

An **execution thread** represents a conversation or agentic loop. Base currently manages sessions from external runners rather than executing sessions itself. The goal is to interface with any model, any session runner, and any execution environment.

Supported session runners include Claude Code, Cursor, ChatGPT, and Pi. New runners can be added by implementing a provider adapter (see Development Guidelines below).

## Core Properties

- `thread_id`: Unique identifier (UUID). Defines the path to thread data (`user:thread/{thread_id}/`)
- `user_public_key`: Owner of the thread
- `workflow_base_uri`: For Base system sessions, references the executing workflow
- `source`: Session origin info object with `provider` ('base', 'claude', 'cursor', 'chatgpt', 'pi'), `session_id`, `provider_metadata`, etc.
- `thread_state`: Current state - `active` or `archived`
- `session_status`: Current session lifecycle status for web-client-initiated sessions. Enum: `queued`, `starting`, `active`, `idle`, `completed`, `failed`, or null. Null for non-spawned sessions (imported or host-interactive).
- `prompt_snippet`: First 200 characters of the user prompt, used for display in the sessions panel.
- `job_id`: BullMQ job ID for queue correlation. Links the thread to its queued CLI command job.
- `created_at`, `updated_at`, `archived_at`: Lifecycle timestamps
- `archive_reason`: When archived, reason for archiving (`completed` or `user_abandoned`)

## Thread Lifecycle (Spawned Sessions)

For web-client-initiated sessions, the thread is created before the session runner starts, enabling immediate visibility in the UI:

1. **Pre-creation**: Thread is created with `session_status: 'queued'`, `prompt_snippet`, and `job_id`. The thread exists and is visible before any session runner process starts.
2. **Job pickup**: Worker picks up the BullMQ job and sets `session_status: 'starting'`. The `THREAD_ID` environment variable is passed to the session runner process.
3. **Session active**: Session start hook fires, sets `session_status: 'active'`.
4. **Session idle**: Session reaches an idle state awaiting input, sets `session_status: 'idle'`.
5. **Completion**: Session end hook fires, sets `session_status: 'completed'`, finalizes metadata, and queues analysis.
6. **Failure**: If the session errors at any stage, `session_status` is set to `failed`.

For imported sessions and host-interactive sessions, threads are created after the session completes and `session_status` remains null.

## Session Runners

Base supports importing and tracking sessions from multiple runners (Claude Code, Cursor, ChatGPT, Pi). Each runner has a session provider adapter that handles discovery, normalization, and metadata extraction. See [[sys:system/text/session-orchestrator.md]] for provider details and the provider architecture.

## Session Normalization

All sessions are normalized to the standard thread format regardless of runner:

1. **Timeline Conversion**: Runner-specific message formats to standard timeline entries
2. **Metadata Extraction**: Session properties to thread metadata
3. **Tool Call Mapping**: Runner-specific tool usage to standard tool call/result entries
4. **Context Preservation**: Runner-specific data retained in entry metadata

## Execution Environments

Sessions can execute in different environments depending on the use case:

**Container Sessions (Non-Interactive or Interactive)**

- Run in user-specific Docker containers
- Isolated environment with controlled tool access and user-base access
- Triggered by API, scheduled commands, or other sessions

**Host Sessions (Interactive)**

- Run directly on the user host machine
- Full terminal and filesystem access
- User-driven with real-time interaction
- Direct filesystem writes to user-base

All execution environments share the same user-base via file system mounting and git synchronization. See [[sys:system/text/system-design.md]] for deployment architecture details.

## Timeline Structure

Threads maintain a chronological timeline with standardized entry types:

- **message**: User, system, or assistant messages
- **tool_call**: Tool invocation requests
- **tool_result**: Tool execution results
- **error**: Error events
- **state_change**: State transitions

This unified structure enables:

- Cross-provider session analysis
- Consistent replay and inspection
- Standard querying interfaces

## Filesystem Structure

```
user:thread/{thread_id}/
  metadata.json     # Thread configuration and state
  timeline.jsonl    # Chronological event log (JSON Lines format)
  raw-data/         # Original provider data (external sessions only)
```

### Timeline Format (JSONL)

The timeline uses JSON Lines format where each line is a complete JSON object representing one timeline entry:

```jsonl
{"id": "entry-1", "timestamp": "2025-01-01T00:00:00Z", "type": "message", ...}
{"id": "entry-2", "timestamp": "2025-01-01T00:00:01Z", "type": "tool_call", ...}
```

Benefits of JSONL format:

- **Streaming reads**: Parse line-by-line without loading entire file into memory
- **Append-only writes**: New entries can be appended without reading existing data
- **Reduced memory pressure**: Critical for large threads with thousands of entries

## JSON Schemas

Formal JSON Schema definitions ensure consistent thread data structure:

### Thread Metadata Schema

- **File**: `sys:system/text/thread-metadata-schema.json`
- Conditional validation based on provider
- Support for sessions from any runner

### Thread Timeline Schema

- **File**: `sys:system/text/thread-timeline-schema.json`
- Polymorphic entry types with type-specific validation
- Standardized entry properties across all timeline entry types

## Development Guidelines

### Adding New Session Runners

1. Create provider directory in `libs-server/integrations/{runner}/`
2. Implement session normalization:
   - Parse runner's export format
   - Map to standard timeline entries
   - Extract session metadata
3. Register provider in the session provider map

### Working with Threads

- Use `libs-server/threads/` for core thread operations
- Runner-specific logic stays in `libs-server/integrations/{runner}/`
- Timeline entries must follow standard schemas
- Preserve original runner data in entry metadata when possible

## Key Benefits

- **Unified Interface**: Query and analyze all sessions consistently regardless of runner
- **Runner Agnostic**: Add new session runners without changing core logic
- **Environment Agnostic**: Sessions can run anywhere -- host, container, or cloud sandbox
- **Model Agnostic**: Track sessions across any inference model or provider
- **Development Efficiency**: Single set of tools works across all sessions
