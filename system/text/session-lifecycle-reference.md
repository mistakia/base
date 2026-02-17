---
title: Session Lifecycle Reference
type: text
description: Complete reference for the active session lifecycle from submission through thread creation, including all WebSocket events, state transitions, and timing characteristics. Serves as the authoritative source of truth for client implementations.
---

# Session Lifecycle Reference

## Overview

This document maps the complete lifecycle of a session initiated from any client through thread creation and beyond. It serves as the authoritative reference for client implementations. Neither the iOS client nor the web client currently implements this lifecycle correctly -- this document establishes the correct behavior that clients should converge toward.

## Architecture Components

| Component | Role |
|---|---|
| **Client** | Submits prompt, receives job_id, tracks session via WebSocket |
| **Base API** (PM2: `base-api`) | REST endpoints + WebSocket server, manages session store |
| **BullMQ Queue** (Redis) | Job queue for session creation with concurrency control |
| **Claude CLI** | Spawned process that executes the prompt |
| **Hook Scripts** | Fire during Claude lifecycle, report state to API |
| **Redis Store** | Active session records with TTL (default 10 minutes) |
| **Thread Watcher** (chokidar) | Filesystem watcher that detects thread file and timeline changes |
| **Metadata Queue** (PM2: `metadata-queue-processor`) | Async title/description generation via Ollama |

### API Dual-Target

The hook scripts send requests to **both** the local API (`localhost:8080`) and the production API (`https://base.tint.space`). Clients connected to either endpoint will receive WebSocket events. This is relevant for network resilience -- a client connected to the remote API will still receive events from locally-running sessions.

## Complete Event Timeline

### Phase 1: Job Submission (synchronous)

```
Client taps Send
  |
  v
POST /api/threads/create-session
  body: { prompt, working_directory, execution_mode? }
  |
  v
Server validates, enqueues BullMQ job
  |
  v
Response: { job_id, queue_position, status: "queued" }
```

**Client state**: Creates PendingSession with `jobId` and `promptSnippet`.

**`execution_mode`**: Optional. Controls whether Claude CLI spawns on the host or inside the Docker container. Defaults to host mode.

No WebSocket events. No thread exists yet.

### Phase 2: Job Processing (async, potentially queued)

```
BullMQ Worker picks up job (concurrency: 3)
  |
  v
Spawns Claude CLI process:
  Host mode:  claude -p --dangerously-skip-permissions [-r <session_id>] -- "<prompt>"
  Container:  docker exec -u node -w <path> [-e JOB_ID=...] base-container claude ...
  env: JOB_ID=<bullmq-job-id>
  cwd: <working_directory>
```

**Delay**: 0-N seconds depending on queue depth.

**Session resume**: If job data includes an existing `session_id`, the CLI is invoked with `-r <session_id>` to resume that session rather than creating a new one. This affects thread correlation since the thread may already exist.

### Phase 3: Session Hooks (async, during Claude execution)

#### SessionStart Hook (fires once when Claude starts)

```
Claude starts
  |
  v
SessionStart hook fires
  |
  v
POST /api/active-sessions (background curl, fire-and-forget)
  body: { session_id, jsonl_session_id, job_id, working_directory, transcript_path }
  |
  v
Server registers session in Redis:
  { session_id, status: "active", thread_id: null, thread_title: null,
    working_directory, job_id, started_at, last_activity_at }
  |
  v
Server calls find_thread_for_session() -> null (no thread exists yet)
  |
  v
WS: ACTIVE_SESSION_STARTED
  payload.session: { session_id, status: "active", thread_id: null,
    thread_title: null, working_directory, job_id, started_at, last_activity_at }
```

**Key**: `thread_id` is always `null` at this point for new sessions. `job_id` is the correlation key.

#### UserPromptSubmit Hook (fires on each turn)

**Important**: This hook runs `sync-claude-session.sh` FIRST (synchronous), then `active-session-hook.sh` (background). The sync script creates/updates thread files, which means the thread can exist mid-session.

```
UserPromptSubmit hook fires
  |
  +--> 1. sync-claude-session.sh (synchronous, up to 30s timeout)
  |     |
  |     v
  |     convert-external-sessions.mjs import --provider claude --session-file <path> --allow-updates
  |     |
  |     v
  |     Writes/updates thread/<uuid>/metadata.json and timeline.jsonl
  |     (thread watcher detects this -> THREAD_CREATED or THREAD_UPDATED + THREAD_TIMELINE_ENTRY_ADDED)
  |     |
  |     v
  |     analyze-thread-relations.mjs (throttled: minimum 300s between runs)
  |
  +--> 2. active-session-hook.sh (background curl, fire-and-forget)
        |
        v
        PUT /api/active-sessions/<session_id>
          body: { status: "active", job_id, working_directory, transcript_path }
          |
          v
        If session has no thread_id yet:
          Server calls find_thread_for_session({ session_id, transcript_path })
            -> matches by source.session_id, falls back to transcript_path
            -> NOW may return a thread_id (if sync created the thread already)
            -> If found, enriches session with thread metadata
        If session already has thread_id:
          Server updates latest_timeline_event from watcher cache
          Server invalidates thread cache
          |
          v
        WS: ACTIVE_SESSION_UPDATED
          payload.session: { session_id, status: "active",
            thread_id: <uuid-or-null>, thread_title: <string-or-null>,
            working_directory, job_id, ... }
```

**Key insight**: The thread can be created mid-session by the UserPromptSubmit sync hook. After the first sync, subsequent PUT calls will find the thread and include `thread_id` in the ACTIVE_SESSION_UPDATED event. Once linked, subsequent updates also refresh `latest_timeline_event` from the watcher's in-memory cache.

#### PostToolUse Hook (fires on each tool use)

```
PostToolUse hook fires
  |
  v
active-session-hook.sh (background curl, fire-and-forget)
  PUT /api/active-sessions/<session_id>
    body: { status: "active", job_id, working_directory, transcript_path }
    |
    v
  WS: ACTIVE_SESSION_UPDATED (same as above, thread_id may or may not be set)
```

**Note**: PostToolUse does NOT run sync-claude-session.sh. Only active-session-hook.sh. This means PostToolUse events provide activity heartbeats but do not update thread content.

#### Stop Event (fires when Claude goes idle)

```
Stop hook fires
  |
  v
active-session-hook.sh (background curl, fire-and-forget)
  PUT /api/active-sessions/<session_id>
    body: { status: "idle", job_id, working_directory, transcript_path }
    |
    v
  WS: ACTIVE_SESSION_UPDATED
    payload.session.status: "idle"
```

**Note**: The Stop event transitions the session status to "idle", distinct from "active". Clients should use this to show the session is waiting for input or has paused. Like PostToolUse, it does NOT run sync-claude-session.sh.

### Phase 4: Session End

```
Claude CLI exits
  |
  v
SessionEnd hooks fire (in order):
  |
  +--> 1. sync-claude-session.sh (synchronous, 30s timeout)
  |     |
  |     v
  |     convert-external-sessions.mjs import --allow-updates (creates/updates thread)
  |       -> Writes metadata.json and timeline.jsonl to thread/<uuid>/
  |       -> Thread watcher fires THREAD_CREATED (or THREAD_UPDATED) + THREAD_TIMELINE_ENTRY_ADDED
  |     |
  |     v
  |     analyze-thread-relations.mjs (forced, no throttle at SessionEnd)
  |     |
  |     v
  |     auto-commit-threads.sh (git add + commit in thread submodule)
  |     |
  |     v
  |     Queues thread_id to metadata analysis queue (for title generation)
  |       (skips: metadata-analysis sessions, agent/subagent sessions, already-analyzed threads)
  |
  +--> 2. active-session-hook.sh (background curl, fire-and-forget)
        |
        v
        DELETE /api/active-sessions/<session_id>
          |
          v
        Server removes session from Redis
          |
          v
        WS: ACTIVE_SESSION_ENDED
          payload: { session_id } (ONLY session_id, no thread_id, no session object)
```

**Critical ordering issue**: The SessionEnd hooks fire sequentially. `sync-claude-session.sh` runs FIRST (up to 30s). `active-session-hook.sh` runs SECOND. BUT active-session-hook.sh sends its DELETE via background curl (`&`), so the actual order of WebSocket events the client receives is:

1. `THREAD_CREATED` (or `THREAD_UPDATED`) + `THREAD_TIMELINE_ENTRY_ADDED` - from the thread watcher detecting files written by sync script
2. `ACTIVE_SESSION_ENDED` - from the DELETE curl (fires after sync script completes)

However, since the DELETE curl is fire-and-forget background, there can be a small race where ACTIVE_SESSION_ENDED arrives before or very close to THREAD_CREATED.

### Phase 5: Post-Session (async)

```
metadata-queue-processor picks up thread_id from queue
  |
  v
Runs LLM inference (Ollama) to generate title + description
  |
  v
Updates metadata.json with title and short_description
  |
  v
Thread watcher detects change -> WS: THREAD_UPDATED
  payload.thread: { thread_id, title: "<generated>", ... }
```

**Delay**: Seconds to minutes depending on Ollama queue and model speed.

## WebSocket Event Reference

### ACTIVE_SESSION_STARTED

```json
{
  "type": "ACTIVE_SESSION_STARTED",
  "payload": {
    "session": {
      "session_id": "string",
      "status": "active",
      "thread_id": "string | null",
      "thread_title": "string | null",
      "latest_timeline_event": "object | null",
      "working_directory": "string",
      "transcript_path": "string",
      "job_id": "string | null",
      "started_at": "ISO string",
      "last_activity_at": "ISO string"
    }
  }
}
```

**Emitted**: Once, when SessionStart hook fires POST.
**thread_id**: Always null for new sessions. May be non-null for resumed sessions.
**job_id**: Present when session was started via the job queue (iOS flow). Absent for manually started sessions.

### ACTIVE_SESSION_UPDATED

```json
{
  "type": "ACTIVE_SESSION_UPDATED",
  "payload": {
    "session": {
      "session_id": "string",
      "status": "active | idle",
      "thread_id": "string | null",
      "thread_title": "string | null",
      "latest_timeline_event": "object | null",
      "working_directory": "string",
      "transcript_path": "string",
      "job_id": "string | null",
      "started_at": "ISO string",
      "last_activity_at": "ISO string",
      "message_count": "number (if thread linked)",
      "duration_minutes": "number (if thread linked)",
      "total_tokens": "number (if thread linked)",
      "source_provider": "string (if thread linked)"
    }
  }
}
```

**Emitted**: On every UserPromptSubmit, PostToolUse, and Stop hook fire.
**status**: "active" for UserPromptSubmit and PostToolUse, "idle" for Stop.
**thread_id**: Starts null, may become non-null once the thread is created AND find_thread_for_session() succeeds on a subsequent PUT call. For queue-created sessions, this typically happens after the first UserPromptSubmit sync creates the thread.

### ACTIVE_SESSION_ENDED

```json
{
  "type": "ACTIVE_SESSION_ENDED",
  "payload": {
    "session_id": "string"
  }
}
```

**Emitted**: Once, when SessionEnd hook fires DELETE.
**Note**: Only contains `session_id`. No thread_id, no session object. The session is already deleted from Redis.

### THREAD_CREATED

```json
{
  "type": "THREAD_CREATED",
  "payload": {
    "thread": {
      "thread_id": "string",
      "title": "string | null",
      "short_description": "string | null",
      "thread_state": "active",
      "source": {
        "provider": "claude",
        "session_id": "string (the Claude session_id)",
        "imported_at": "ISO string",
        "raw_data_saved": true,
        "provider_metadata": {
          "session_provider": "claude",
          "working_directory": "string",
          "file_source": "string (path to JSONL)",
          "models": ["string"],
          "...": "additional fields"
        }
      },
      "user_public_key": "string",
      "created_at": "ISO string",
      "updated_at": "ISO string",
      "...": "additional metadata fields"
    }
  }
}
```

**Emitted**: When thread watcher detects new metadata.json (500ms stability delay after write).
**source.session_id**: The Claude session_id that created this thread. This is the key for linking back to the active/ended session in the client.
**title**: May be null initially. Set to truncated first user message by the converter, then updated later by metadata analysis.

### THREAD_UPDATED

Same payload structure as THREAD_CREATED. Emitted when metadata.json is modified (e.g., after metadata analysis generates a title, or after each UserPromptSubmit/SessionEnd sync updates the thread).

### THREAD_TIMELINE_ENTRY_ADDED

```json
{
  "type": "THREAD_TIMELINE_ENTRY_ADDED",
  "payload": {
    "thread_id": "string",
    "entry": "object (timeline entry)",
    "user_public_key": "string",
    "thread_title": "string | null"
  }
}
```

**Emitted**: When the thread watcher detects new entries appended to `timeline.jsonl`.
**Tiered delivery**: Clients subscribed to the thread (via WebSocket subscription) receive the full entry object. Non-subscribed clients receive a truncated entry, batched at 200ms flush intervals.
**Client use**: This is the primary event for showing live session progress. Each entry represents a message, tool call, or tool result in the session timeline.

### THREAD_JOB_FAILED

```json
{
  "type": "THREAD_JOB_FAILED",
  "payload": {
    "job_id": "string",
    "error_message": "string"
  }
}
```

**Emitted**: When the BullMQ job fails (Claude CLI crash, timeout, etc.).
**Broadcast**: Sent to all authenticated WebSocket clients without permission filtering (since there is no thread to check permissions against). Clients match by `job_id` to correlate with pending sessions.

## Correlation Keys

The session lifecycle uses multiple identifiers at different stages:

| Identifier | Source | Available When | Purpose |
|---|---|---|---|
| `job_id` | BullMQ job ID | From create-session response | Links iOS pending session to WS events |
| `session_id` | Claude CLI session UUID | From ACTIVE_SESSION_STARTED | Identifies the Claude session |
| `thread_id` | Deterministic from session_id+provider | From THREAD_CREATED or ACTIVE_SESSION_UPDATED (after thread exists) | Identifies the thread for navigation |
| `source.session_id` | Thread metadata | From THREAD_CREATED payload | Links thread back to the session_id |

### Correlation Flow

```
job_id (iOS has this)
  |-- matches --> ACTIVE_SESSION_STARTED.payload.session.job_id
  |                 gives us: session_id
  |
session_id (from WS event)
  |-- matches --> THREAD_CREATED.payload.thread.source.session_id
  |                 gives us: thread_id
  |
  |-- also found in --> ACTIVE_SESSION_UPDATED.payload.session.thread_id
  |                       (when server matches the thread mid-session)
```

## Timing Characteristics

| Event | Typical Delay After Previous |
|---|---|
| create-session response | < 1 second |
| BullMQ job pickup | 0-30 seconds (depends on queue) |
| Claude CLI startup | 2-5 seconds |
| ACTIVE_SESSION_STARTED | Immediate after startup |
| First ACTIVE_SESSION_UPDATED | Seconds (after first prompt processing) |
| Thread creation (metadata.json write) | During first UserPromptSubmit sync (2-8s after first turn) |
| THREAD_CREATED (watcher detection) | ~500ms after metadata.json write |
| thread_id in ACTIVE_SESSION_UPDATED | Next hook fire after thread exists |
| ACTIVE_SESSION_ENDED | After all SessionEnd hooks complete |
| THREAD_UPDATED (with generated title) | Seconds to minutes (async Ollama) |

## Client State Machine

Based on the event flow, the client should track sessions through these states:

```
PENDING (has job_id, no session_id)
  |
  |-- ACTIVE_SESSION_STARTED (matching job_id) --> ACTIVE
  |-- THREAD_JOB_FAILED (matching job_id) -------> FAILED
  v
ACTIVE (has session_id, thread_id: null, status: "active")
  |
  |-- ACTIVE_SESSION_UPDATED (status: "idle") --> IDLE (waiting for input)
  |-- THREAD_CREATED (matching source.session_id)
  |   or ACTIVE_SESSION_UPDATED (with thread_id)
  v
ACTIVE_LINKED (has session_id + thread_id, clickable)
  |
  |-- ACTIVE_SESSION_UPDATED (status: "idle") --> IDLE_LINKED
  |-- ACTIVE_SESSION_ENDED ----------------------> ENDED_LINKED
  v
IDLE_LINKED (has session_id + thread_id, status: "idle")
  |
  |-- ACTIVE_SESSION_UPDATED (status: "active") --> ACTIVE_LINKED
  |-- ACTIVE_SESSION_ENDED -----------------------> ENDED_LINKED
  v
ENDED (has session_id, may or may not have thread_id)
  |
  |-- THREAD_CREATED (if not linked yet, matching source.session_id)
  v
ENDED_LINKED (has thread_id, clickable)
  |
  |-- auto-dismiss timer or manual dismiss
  v
REMOVED

FAILED (has job_id + error_message)
  |
  |-- auto-dismiss timer or manual dismiss
  v
REMOVED
```

**Key ordering rules**:
- THREAD_CREATED can arrive before or after ACTIVE_SESSION_ENDED depending on timing. The client must handle both orderings.
- ACTIVE_SESSION_UPDATED with thread_id and THREAD_CREATED with matching source.session_id are redundant paths to linking. The client should accept whichever arrives first and ignore duplicates.
- The "idle" status (from Stop events) indicates Claude is waiting for input or has paused processing. "active" means it is actively processing.

## Network Resilience

Clients must handle WebSocket disconnections gracefully since session lifecycle events are ephemeral (not persisted or replayed).

### Reconnection Recovery

On WebSocket reconnect, the client should:

1. **Fetch active sessions**: `GET /api/active-sessions` returns all current sessions from Redis. This recovers any ACTIVE_SESSION_STARTED events missed during disconnection.
2. **Check for thread linkage**: Active sessions returned from the REST endpoint include `thread_id` if already linked, recovering missed THREAD_CREATED events.
3. **Reconcile pending sessions**: Compare pending `job_id`s against active sessions' `job_id` fields to resolve any missed STARTED events.
4. **Fetch recent threads**: If the client tracks ended sessions, `GET /api/threads` can recover threads created during disconnection.

### Missed Event Scenarios

| Missed Event | Recovery |
|---|---|
| ACTIVE_SESSION_STARTED | GET /api/active-sessions will include it |
| ACTIVE_SESSION_UPDATED | GET /api/active-sessions returns current state |
| ACTIVE_SESSION_ENDED | Session will be absent from GET /api/active-sessions; client infers ended |
| THREAD_CREATED | Thread appears in GET /api/threads; active session may include thread_id |
| THREAD_UPDATED | GET /api/threads/<id> returns current metadata |
| THREAD_TIMELINE_ENTRY_ADDED | Subscribe to thread after reconnect; fetch timeline via REST |
| THREAD_JOB_FAILED | Check job status via BullMQ job API if pending session has no matching active session |

### Stale State Detection

Sessions in Redis have a TTL (default 10 minutes from last update). If a session's hooks stop firing (Claude crash without SessionEnd), the Redis key expires and the session silently disappears. Clients should:
- Periodically poll GET /api/active-sessions to detect stale sessions that expired
- Treat a session absent from the REST response but still tracked locally as ended
- Not rely solely on ACTIVE_SESSION_ENDED for end-of-session detection
