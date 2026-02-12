---
title: Read Thread
type: workflow
description: Extract information from a thread using token-efficient commands
created_at: '2026-01-28T20:28:18.931Z'
entity_id: b1bb7504-b5dd-425c-bb2b-39bd584127bc
observations:
  - '[efficiency] JSONL format allows line-based processing with tail/head'
  - '[pattern] Mode-based extraction enables targeted information retrieval'
  - '[canonical] Single source of truth for thread extraction commands'
prompt_properties:
  - name: thread_id
    type: string
    description: UUID of the thread to read
    required: true
  - name: mode
    type: string
    description: Extraction mode
    enum:
      - context
      - messages
      - summary
      - relations
      - files
      - full
    default: context
  - name: message_limit
    type: number
    description: Number of recent assistant messages to include (for context mode)
    default: 3
public_read: false
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
tags:
  - user:tag/base-project.md
tools:
  - bash
updated_at: '2026-01-28T20:28:18.931Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Read Thread

<task>
Extract information from a thread using token-efficient bash/jq commands. Provides standardized extraction modes for different use cases.
</task>

<context>
Thread structure:
```
thread/<uuid>/
  metadata.json    # Thread state, title, description, relations, file_references
  timeline.jsonl   # Event history (JSONL format - one JSON object per line)
  raw-data/        # Original session data
  memory/          # Thread-specific memory
```

Timeline event types: `message`, `tool_call`, `tool_result`, `thinking`, `system`, `thread_state_change`

Message roles: `user`, `assistant`
</context>

<instructions>

## Setup

```bash
THREAD_DIR="/Users/trashman/user-base/thread/${thread_id}"
```

## Mode: context (default)

Quick thread understanding - first user message plus recent assistant messages.

```bash
# First user message (the original request)
jq -r 'select(.type == "message" and .role == "user") | .content' "${THREAD_DIR}/timeline.jsonl" | head -1

# Last N assistant messages
tail -200 "${THREAD_DIR}/timeline.jsonl" | jq -r 'select(.type == "message" and .role == "assistant") | .content' | tail -${message_limit:-3}
```

## Mode: messages

All user and assistant messages for full conversation reconstruction.

```bash
jq -r 'select(.type == "message" and (.role == "user" or .role == "assistant")) | "[\(.role)]: \(.content)"' "${THREAD_DIR}/timeline.jsonl"
```

For large threads, truncate message content:
```bash
jq -r 'select(.type == "message" and (.role == "user" or .role == "assistant")) | "[\(.role)]: \(.content[:500])"' "${THREAD_DIR}/timeline.jsonl"
```

## Mode: summary

Statistical overview without message content.

```bash
# Metadata summary
jq '{thread_id, title, short_description, thread_state, message_count, tool_call_count, created_at, updated_at}' "${THREAD_DIR}/metadata.json"

# Event type counts
jq -s '[.[] | .type] | group_by(.) | map({type: .[0], count: length})' "${THREAD_DIR}/timeline.jsonl"

# Tool usage frequency
jq -r 'select(.type == "tool_call") | .content.tool_name' "${THREAD_DIR}/timeline.jsonl" | sort | uniq -c | sort -rn
```

## Mode: relations

Entity references from thread metadata.

```bash
jq '{relations, file_references, directory_references}' "${THREAD_DIR}/metadata.json"
```

To extract just relation URIs:
```bash
jq -r '.relations[]?' "${THREAD_DIR}/metadata.json"
```

## Mode: files

Files accessed during thread execution.

```bash
# From metadata
jq -r '.file_references[]?' "${THREAD_DIR}/metadata.json"

# From timeline tool calls (Read, Edit, Write tools)
jq -r 'select(.type == "tool_call") | .content.tool_parameters | .file_path? // .path? // empty' "${THREAD_DIR}/timeline.jsonl" | sort -u
```

## Mode: full

Comprehensive extraction combining metadata, context, relations, and files.

```bash
# 1. Metadata
jq '.' "${THREAD_DIR}/metadata.json"

# 2. First user message
jq -r 'select(.type == "message" and .role == "user") | .content' "${THREAD_DIR}/timeline.jsonl" | head -1

# 3. Last 3 assistant messages
tail -200 "${THREAD_DIR}/timeline.jsonl" | jq -r 'select(.type == "message" and .role == "assistant") | .content' | tail -3

# 4. Tool usage summary
jq -r 'select(.type == "tool_call") | .content.tool_name' "${THREAD_DIR}/timeline.jsonl" | sort | uniq -c | sort -rn | head -10
```

## Token Efficiency Guidelines

| File Size | Strategy |
|-----------|----------|
| < 10KB | Process entire timeline |
| 10KB - 100KB | Use `tail` to limit events before jq |
| 100KB - 1MB | Filter by event type, truncate content |
| > 1MB | Use summary mode or statistical queries only |

Check timeline size:
```bash
wc -c < "${THREAD_DIR}/timeline.jsonl"
```

## Common Patterns

**Get recent events (last 20):**
```bash
tail -20 "${THREAD_DIR}/timeline.jsonl" | jq -c '{type, role: .role, tool: .content.tool_name}'
```

**Check for errors:**
```bash
jq 'select(.type == "error" or (.type == "tool_result" and .content.result.success == false))' "${THREAD_DIR}/timeline.jsonl"
```

**Get thinking blocks:**
```bash
jq -r 'select(.type == "thinking") | .content' "${THREAD_DIR}/timeline.jsonl"
```

</instructions>

<output_format>
Output depends on mode selected. For programmatic use, prefer JSON output. For human review, plain text with clear section headers.
</output_format>
