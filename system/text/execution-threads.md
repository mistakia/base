---
title: Execution Threads
type: text
description: >-
  Defines execution threads as a unified session model for handling both conversations and agentic
  workflows across different providers within the system.
base_uri: sys:system/text/execution-threads.md
created_at: '2025-05-27T18:10:20.241Z'
entity_id: 576c86bd-3ff4-4d88-b246-f168f3f11700
observations:
  - >-
    [design] Threads provide a standardized session format for all interactions, whether Base system
    sessions or external provider sessions
  - >-
    [architecture] Unified timeline structure enables consistent handling across different session
    providers
  - >-
    [integration] Session provider acts as the "engine" choice - external providers are normalized
    to common thread format
  - '[focus] Agentic workflows are the primary use case, with conversations as a secondary pattern'
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/workflow.md]]
updated_at: '2026-01-05T19:24:56.466Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Execution Threads

Execution threads are the system's unified representation of sessions - whether conversations or agentic workflows from the Base system or external providers. All sessions are standardized to enable consistent storage, querying, and analysis.

## Definition

An **Execution Thread** is a session that captures conversations and agentic workflows. Sessions can originate from:

1. **Base System Sessions**: Native workflows and conversations executing within the Base system
2. **External Provider Sessions**: Conversations and agentic workflows from external session providers (Claude, Cursor, OpenAI, etc.)

The session provider is simply the choice of "engine" for the interaction. All threads follow the same structure and interfaces, allowing the system to handle them uniformly regardless of provider.

## Core Properties

- `thread_id`: Unique identifier (UUID). Defines the path to thread data (`user:thread/{thread_id}/`)
- `user_public_key`: Owner of the thread
- `workflow_base_uri`: For Base system sessions, references the executing workflow
- `session_provider`: Origin of the session (e.g., 'base', 'claude', 'cursor', 'openai')
- `thread_state`: Current state - `active` or `archived`
- `created_at`, `updated_at`, `archived_at`: Lifecycle timestamps
- `archive_reason`: When archived, reason for archiving (`completed` or `user_abandoned`)

## External Session Providers

The system supports importing sessions from:

### Claude (Anthropic)

- Source: Chat conversations from claude.ai
- Format: JSONL export files
- Preserves: Messages, tool calls, artifacts, context

### Cursor

- Source: AI coding sessions from Cursor IDE
- Format: SQLite database export
- Preserves: Code edits, AI interactions, file context

### OpenAI

- Source: ChatGPT conversations
- Format: JSON export from data archive
- Preserves: Messages, model responses, conversation metadata

## Session Normalization

All external sessions are normalized to the standard thread format:

1. **Timeline Conversion**: Provider-specific message formats → standard timeline entries
2. **Metadata Extraction**: Session properties → thread metadata
3. **Tool Call Mapping**: External tool usage → standard tool call/result entries
4. **Context Preservation**: Provider-specific data retained in entry metadata

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
  timeline.json     # Chronological event log
  memory/          # Working memory directory (git repository)
  raw-data/        # Original provider data (external sessions only)
```

## JSON Schemas

Formal JSON Schema definitions ensure consistent thread data structure:

### Thread Metadata Schema

- **File**: `sys:system/text/thread-metadata-schema.json`
- Conditional validation based on session provider
- Support for both Base system and external provider sessions

### Thread Timeline Schema

- **File**: `sys:system/text/thread-timeline-schema.json`
- Polymorphic entry types with type-specific validation
- Standardized entry properties across all timeline entry types

## Development Guidelines

### Adding New Providers

1. Create provider directory in `libs-server/integrations/{provider}/`
2. Implement session normalization:
   - Parse provider's export format
   - Map to standard timeline entries
   - Extract session metadata
3. Register provider in thread creation logic

### Working with Threads

- Use `libs-server/threads/` for core thread operations
- Provider-specific logic stays in `libs-server/integrations/{provider}/`
- Timeline entries must follow standard schemas
- Preserve original data in entry metadata when possible

## Key Benefits

- **Unified Interface**: Query and analyze all sessions consistently
- **Provider Agnostic**: Add new sources without changing core logic
- **Future Proof**: Standardized format adapts to new session types
- **Development Efficiency**: Single set of tools works across all sessions
