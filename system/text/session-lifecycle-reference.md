---
title: Session Lifecycle Reference
type: text
description: >-
  Complete reference for the active session lifecycle from submission through thread creation,
  including all WebSocket events, state transitions, and timing characteristics. Serves as the
  authoritative source of truth for client implementations.
base_uri: sys:system/text/session-lifecycle-reference.md
created_at: '2026-02-22T01:01:36.309Z'
entity_id: 9fe11418-4256-4058-b41c-1b12dd7c3ad8
updated_at: '2026-02-22T12:00:00.000Z'
user_public_key: 00000000-0000-0000-0000-000000000000
---

# Session Lifecycle Reference

## Overview

This document maps the complete lifecycle of a session initiated from any client through thread creation and beyond. It serves as the authoritative reference for client implementations. Neither the iOS client nor the web client currently implements this lifecycle correctly -- this document establishes the correct behavior that clients should converge toward.

### AI Harness Model

The session lifecycle is designed to be **harness-agnostic**. The system treats the AI session runner (the process that executes prompts and produces responses) as a replaceable component. The current implementation uses Claude Code CLI as the session runner, but the architecture supports drop-in replacement with other harnesses (Cursor, OpenCode, etc.).

The harness contract has two integration surfaces:

1. **Session spawning**: The job worker spawns a harness process with a prompt. Currently only Claude CLI spawning is implemented (`create-session-claude-cli.mjs`), but the job data and API surface are harness-neutral.

2. **Hook reporting**: The harness reports lifecycle events (start, activity, idle, end) to the Base API via hook scripts. The hook scripts translate harness-specific events into the generic Base session lifecycle. Different harnesses require different hook mechanisms -- Claude Code uses its native hook system; other harnesses would need equivalent adapters.

The **session import pipeline** already supports multiple providers via `SessionProviderBase` (Claude, Cursor, ChatGPT, Pi), so threads created by any harness are normalized into the same format.

Throughout this document, Claude CLI is used as the reference implementation. Harness-specific details are called out where they affect the integration contract.

## Architecture Components

| Component                                            | Role                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| **Client**                                           | Submits prompt, receives job_id, tracks session via WebSocket    |
| **Base API** (PM2: `base-api`)                       | REST endpoints + WebSocket server, manages session store         |
| **BullMQ Queue** (Redis)                             | Job queue for session creation with concurrency control          |
| **AI Harness** (e.g. Claude CLI)                     | Spawned process that executes the prompt                         |
| **Hook Scripts**                                     | Fire during harness lifecycle, report state to API               |
| **Redis Store**                                      | Active session records with TTL (default 10 minutes)             |
| **Thread Watcher** (chokidar)                        | Filesystem watcher that detects thread file and timeline changes |
| **Metadata Queue** (PM2: `metadata-queue-processor`) | Async title/description generation via Ollama                    |

### API Dual-Target

The hook scripts send requests to **both** the local API (`localhost:8080`) and the production API (`https://base.tint.space`). Clients connected to either endpoint will receive WebSocket events. This is relevant for network resilience -- a client connected to the remote API will still receive events from locally-running sessions.

### Harness-Specific: Claude Code Hooks

Claude Code provides a native hook system configured via `.claude/settings.local.json`. Hook scripts receive a JSON payload on stdin containing `session_id`, `transcript_path`, `cwd`, and `hook_event_name`. The hook event names map to Claude Code lifecycle stages:

| Claude Code Hook Event | Base Session Lifecycle Equivalent             |
| ---------------------- | --------------------------------------------- |
| `SessionStart`         | Session started (harness process began)       |
| `UserPromptSubmit`     | Turn started (new prompt being processed)     |
| `PostToolUse`          | Activity heartbeat (tool execution completed) |
| `Stop`                 | Session idle (harness waiting for input)      |
| `SessionEnd`           | Session ended (harness process exiting)       |

Other harnesses would need equivalent adapters that translate their lifecycle events into the same API calls (POST/PUT/DELETE to `/api/active-sessions`).

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
Response: { job_id, queue_position, status: "queued", message: "..." }
```

**Client state**: Creates PendingSession with `jobId` and `promptSnippet`.

**`execution_mode`**: Optional. Controls whether the harness spawns on the host or inside the Docker container. Defaults to the value of `config.threads.cli.default_execution_mode`.

No WebSocket events. No thread exists yet.

### Phase 2: Job Processing (async, potentially queued)

```
BullMQ Worker picks up job (concurrency: 3, configurable via config.threads.queue.max_concurrent_jobs)
  |
  v
Spawns AI harness process
  env: JOB_ID=<bullmq-job-id>
  cwd: <working_directory>
```

**Delay**: 0-N seconds depending on queue depth.

**Session resume**: If job data includes an existing `session_id`, the harness is invoked in resume mode rather than creating a new session. This affects thread correlation since the thread may already exist.

#### Harness-Specific: Claude CLI Spawning

The current implementation resolves the `claude` binary and constructs:

```
Host mode:  claude -p --dangerously-skip-permissions [-r <session_id>] -- "<prompt>"
Container:  docker exec -u node -w <path> [-e JOB_ID=...] [-e BASE_API_PROTO=...] [-e BASE_API_PORT=...] base-container claude ...
```

- `-p`: Programmatic/print mode (non-interactive)
- `--dangerously-skip-permissions`: Enabled by default (controlled by `skip_permissions` parameter)
- `-r <session_id>`: Resume an existing session
- Container mode also passes `BASE_API_PROTO` and `BASE_API_PORT` env vars when applicable

#### Container User Mode

When `execution_mode` is `container_user`, sessions run inside the Docker container as the `node` user. This affects hook script behavior:

- Hook scripts must resolve paths relative to the container filesystem
- API calls from hooks use `BASE_API_PROTO` and `BASE_API_PORT` env vars (defaulting to `http` and `8080`)
- The session transcript path is a container-local path, which the sync script maps to the host path for thread file creation
- Thread files are written to the shared volume mount, so the thread watcher on the host detects them normally

### Phase 3: Session Hooks (async, during harness execution)

#### SessionStart (fires once when harness starts)

```
Harness starts
  |
  v
SessionStart hook fires
  |
  v
POST /api/active-sessions (background, fire-and-forget)
  body: { session_id, jsonl_session_id, job_id, working_directory, transcript_path }
  |
  v
Server registers session in Redis:
  { session_id, status: "active", thread_id: null, thread_title: null,
    latest_timeline_event: null, working_directory, transcript_path,
    job_id, started_at, last_activity_at }
  |
  v
Server calls find_thread_for_session({ session_id, transcript_path })
  -> null for new sessions (no thread metadata matches yet)
  -> may return thread_id for resumed sessions where the thread already exists
  |
  v
WS: ACTIVE_SESSION_STARTED
  payload.session: { session_id, status: "active", thread_id: null,
    thread_title: null, working_directory, job_id, started_at, last_activity_at }
```

**Key**: `thread_id` is `null` at this point for new sessions. For resumed sessions, `find_thread_for_session` may match an existing thread. `job_id` is the correlation key for queue-created sessions.

#### UserPromptSubmit (fires on each turn)

**Important**: This hook runs the **sync script** FIRST (synchronous), then the **session hook** (background). The sync script creates/updates thread files, which means the thread can exist mid-session. The sync script also queues the thread for metadata analysis when it creates or updates a thread.

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
  |     |
  |     v
  |     If thread was created or updated: queues thread_id to metadata analysis queue
  |       (skips: metadata-analysis sessions, agent/subagent sessions,
  |        already-analyzed newly-created threads, already-queued threads)
  |
  +--> 2. active-session-hook.sh (background, fire-and-forget)
        |
        v
        PUT /api/active-sessions/<session_id>
          body: { status: "active", job_id, working_directory, transcript_path }
          |
          v
        If session has no thread_id yet (first discovery):
          Server calls find_thread_for_session({ session_id, transcript_path })
            -> matches by source.session_id, falls back to transcript_path
            -> NOW may return a thread_id (if sync created the thread already)
            -> If found, enriches session with full thread metadata:
               thread_title, latest_timeline_event, message_count,
               duration_minutes, total_tokens, source_provider
        If session already has thread_id (subsequent updates):
          Server updates latest_timeline_event from watcher cache only
          Server invalidates thread cache
          |
          v
        WS: ACTIVE_SESSION_UPDATED
          payload.session: { session_id, status: "active",
            thread_id: <uuid-or-null>, thread_title: <string-or-null>,
            working_directory, job_id, ... }
```

**Key insight**: The thread can be created mid-session by the UserPromptSubmit sync hook. After the first sync, subsequent PUT calls will find the thread and include `thread_id` in the ACTIVE_SESSION_UPDATED event. Once linked, subsequent updates only refresh `latest_timeline_event` from the watcher's in-memory cache (not full thread metadata from disk).

#### PostToolUse (fires on each tool use)

```
PostToolUse hook fires
  |
  +--> 1. active-session-hook.sh (background, fire-and-forget)
  |     PUT /api/active-sessions/<session_id>
  |       body: { status: "active", job_id, working_directory, transcript_path }
  |       -> WS: ACTIVE_SESSION_UPDATED (same as above, thread_id may or may not be set)
  |
  +--> 2. sync-claude-session.sh (throttled: 30s minimum between runs, lock-guarded)
        |
        v
        Throttle check: if last sync < 30s ago, exits immediately (<1ms)
        Lock check: if another sync is running, exits immediately
        |
        v (when not throttled)
        convert-external-sessions.mjs import --allow-updates
          -> Updates thread metadata.json and timeline.jsonl
          -> Thread watcher fires THREAD_UPDATED + THREAD_TIMELINE_ENTRY_ADDED
        |
        v
        analyze-thread-relations.mjs (throttled: minimum 300s between runs)
```

**Note**: PostToolUse runs the sync script with throttling. Most invocations exit in <1ms (throttle check). When the converter runs (~once per 30s), it updates the thread with the latest session data. This provides live thread updates during long-running sessions. The throttle file is cleaned up on SessionEnd.

#### Stop (fires when harness goes idle)

```
Stop hook fires
  |
  v
active-session-hook.sh (background, fire-and-forget)
  PUT /api/active-sessions/<session_id>
    body: { status: "idle", job_id, working_directory, transcript_path }
    |
    v
  WS: ACTIVE_SESSION_UPDATED
    payload.session.status: "idle"
```

**Note**: The Stop event transitions the session status to "idle", distinct from "active". Clients should use this to show the session is waiting for input or has paused. Stop does NOT run the sync script (PostToolUse handles periodic sync).

### Phase 4: Session End

```
AI harness process exits
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
  |     If thread was created or updated: queues thread_id to metadata analysis queue
  |       (skips: metadata-analysis sessions, agent/subagent sessions,
  |        already-analyzed newly-created threads, already-queued threads)
  |
  +--> 2. active-session-hook.sh (background, fire-and-forget)
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

**Critical ordering issue**: The SessionEnd hooks fire sequentially. The sync script runs FIRST (up to 30s). The session hook runs SECOND. BUT the session hook sends its DELETE via background curl, so the actual order of WebSocket events the client receives is:

1. `THREAD_CREATED` (or `THREAD_UPDATED`) + `THREAD_TIMELINE_ENTRY_ADDED` - from the thread watcher detecting files written by sync script
2. `ACTIVE_SESSION_ENDED` - from the DELETE (fires after sync script completes)

However, since the DELETE is fire-and-forget background, there can be a small race where ACTIVE_SESSION_ENDED arrives before or very close to THREAD_CREATED.

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

**Note**: The metadata queue write happens during both UserPromptSubmit and SessionEnd sync (whichever first creates or updates the thread). Title generation may begin before the session ends.

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
**job_id**: Present when session was started via the job queue (client flow). Absent for manually started sessions.

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
      "message_count": "number (on first thread discovery)",
      "duration_minutes": "number (on first thread discovery)",
      "total_tokens": "number (on first thread discovery)",
      "source_provider": "string (on first thread discovery)"
    }
  }
}
```

**Emitted**: On every UserPromptSubmit, PostToolUse, and Stop hook fire.
**status**: "active" for UserPromptSubmit and PostToolUse, "idle" for Stop.
**thread_id**: Starts null, may become non-null once the thread is created AND find_thread_for_session() succeeds on a subsequent PUT call. For queue-created sessions, this typically happens after the first UserPromptSubmit sync creates the thread.
**Thread-enriched fields**: `message_count`, `duration_minutes`, `total_tokens`, and `source_provider` are included when the thread is first discovered. On subsequent updates with an already-linked thread, only `latest_timeline_event` is refreshed.

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
        "provider": "string (e.g. 'claude', 'cursor', 'chatgpt')",
        "session_id": "string (the harness session_id)",
        "imported_at": "ISO string",
        "raw_data_saved": true,
        "provider_metadata": {
          "session_provider": "string",
          "working_directory": "string",
          "file_source": "string (path to session transcript)",
          "models": ["string"],
          "...": "additional provider-specific fields"
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
**source.provider**: Identifies which AI harness created the thread. The session import pipeline supports multiple providers.
**source.session_id**: The harness session_id that created this thread. This is the key for linking back to the active/ended session in the client.
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
**Tiered delivery**: Clients subscribed to the thread (via WebSocket subscription) receive the full entry object. Non-subscribed clients receive a truncated entry (80-char content max, minimal tool input fields), batched at 200ms flush intervals.
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

**Emitted**: When the BullMQ job fails (harness crash, timeout, etc.).
**Broadcast**: Sent to all authenticated WebSocket clients without permission filtering (since there is no thread to check permissions against). Clients match by `job_id` to correlate with pending sessions.

### THREAD_JOB_STARTED

```json
{
  "type": "THREAD_JOB_STARTED",
  "payload": {
    "job_id": "string",
    "thread_id": "string"
  }
}
```

**Emitted**: When the BullMQ worker picks up a job and begins executing.
**Broadcast**: Sent to all authenticated WebSocket clients without permission filtering.
**Client use**: Transitions pending sessions from "queued" to "starting" status.

## Debug Tracing

### Server-Side Tracing

Enable the `base:session-lifecycle` debug namespace to trace the full session lifecycle on the server:

```bash
DEBUG=base:session-lifecycle node server/...
# or append to existing DEBUG patterns:
DEBUG=api:*,base:session-lifecycle node server/...
```

Trace output includes structured log entries at every state transition:

- **Routes** (`active-sessions.mjs`): POST/PUT/DELETE with session_id, job_id, thread_id, thread discovery status
- **Event emitter** (`session-event-emitter.mjs`): WebSocket emission with event type, recipient count, redacted count
- **Thread watcher** (`thread-watcher.mjs`): Thread creation detection, byte offset tracking, timeline entry emission
- **Session-thread matcher** (`session-thread-matcher.mjs`): Thread lookup attempts, match method (session_id vs transcript_path)

### Client-Side Tracing

Enable client tracing via localStorage:

```javascript
localStorage.setItem('debug:session-lifecycle', '1')
```

Trace output appears in browser console as `[session-lifecycle]` entries:

- **Reducer**: ACTIVE_SESSION_STARTED (with pending match status), ACTIVE_SESSION_UPDATED (with thread link status), ACTIVE_SESSION_ENDED, THREAD_CREATED (with match target), THREAD_TIMELINE_ENTRY_ADDED (with session match)
- **WebSocket service**: All incoming ACTIVE_SESSION_* and THREAD_* messages with key IDs

Disable with `localStorage.removeItem('debug:session-lifecycle')`.

## Early Session Clickability

Sessions are clickable as soon as they start, before a thread exists on disk. The flow:

1. Session starts -- `session_id` is available immediately
2. SessionCard checks for `item.session_id` when `item.id` (thread_id) is absent
3. Clicking opens a session sheet (`session:${session_id}` key in thread-sheet stack)
4. Session sheet shows prompt snippet, status, and working directory with a "Waiting for thread data..." placeholder
5. When the session gains a thread_id (via ACTIVE_SESSION_UPDATED or THREAD_CREATED), the sheet auto-transitions to the full thread view
6. The thread-sheet saga detects the transition and auto-loads thread data + subscribes to WebSocket updates

## Correlation Keys

The session lifecycle uses multiple identifiers at different stages:

| Identifier          | Source                                 | Available When                                                      | Purpose                                   |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| `job_id`            | BullMQ job ID                          | From create-session response                                        | Links client pending session to WS events |
| `session_id`        | AI harness session UUID                | From ACTIVE_SESSION_STARTED                                         | Identifies the harness session            |
| `thread_id`         | Deterministic from session_id+provider | From THREAD_CREATED or ACTIVE_SESSION_UPDATED (after thread exists) | Identifies the thread for navigation      |
| `source.session_id` | Thread metadata                        | From THREAD_CREATED payload                                         | Links thread back to the session_id       |

### Correlation Flow

```
job_id (client has this)
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

| Event                                 | Typical Delay After Previous                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| create-session response               | < 1 second                                                                               |
| BullMQ job pickup                     | 0-30 seconds (depends on queue)                                                          |
| Harness startup                       | 2-5 seconds (varies by harness)                                                          |
| ACTIVE_SESSION_STARTED                | Immediate after startup                                                                  |
| First ACTIVE_SESSION_UPDATED          | Seconds (after first prompt processing)                                                  |
| Thread creation (metadata.json write) | During first successful sync (UserPromptSubmit or PostToolUse, whichever succeeds first) |
| THREAD_CREATED (watcher detection)    | ~500ms after metadata.json write                                                         |
| thread_id in ACTIVE_SESSION_UPDATED   | Next hook fire after thread exists                                                       |
| Periodic thread updates (PostToolUse) | Every ~30s during active tool use (throttled sync)                                       |
| ACTIVE_SESSION_ENDED                  | After all SessionEnd hooks complete                                                      |
| THREAD_UPDATED (with generated title) | Seconds to minutes (async Ollama)                                                        |

## Client State Machine

Based on the event flow, the client should track sessions through these states:

```
PENDING (has job_id, no session_id, clickable: no)
  |
  |-- ACTIVE_SESSION_STARTED (matching job_id) --> ACTIVE
  |-- THREAD_JOB_FAILED (matching job_id) -------> FAILED
  v
ACTIVE (has session_id, thread_id: null, status: "active", clickable: yes via session sheet)
  |
  |-- ACTIVE_SESSION_UPDATED (status: "idle") --> IDLE (waiting for input)
  |-- THREAD_CREATED (matching source.session_id)
  |   or ACTIVE_SESSION_UPDATED (with thread_id)
  v
ACTIVE_LINKED (has session_id + thread_id, clickable: yes via thread sheet)
  |
  |-- ACTIVE_SESSION_UPDATED (status: "idle") --> IDLE_LINKED
  |-- ACTIVE_SESSION_ENDED ----------------------> ENDED_LINKED (stays in sessions map)
  v
IDLE_LINKED (has session_id + thread_id, status: "idle")
  |
  |-- ACTIVE_SESSION_UPDATED (status: "active") --> ACTIVE_LINKED
  |-- ACTIVE_SESSION_ENDED -----------------------> ENDED_LINKED (stays in sessions map)
  v
ENDED_LINKED (has thread_id, status: "ended", stays inline in sessions map, clickable)
  |
  |-- manual dismiss
  v
REMOVED

ENDED_NO_THREAD (no thread_id, moved to ended_sessions map)
  |
  |-- THREAD_CREATED (if matching source.session_id)
  |-- auto-dismiss after 60s
  v
REMOVED

FAILED (has job_id + error_message)
  |
  |-- auto-dismiss timer or manual dismiss
  v
REMOVED
```

**Key behavioral changes**:

- **Early clickability**: Sessions are clickable as soon as they have a `session_id` (before thread exists). The click opens a session sheet that auto-transitions to a thread sheet when `thread_id` becomes available.
- **Inline ended sessions**: Sessions that end with a `thread_id` stay in the `sessions` map with status "ended" rather than moving to `ended_sessions`. This prevents the card from disappearing. Only sessions without a thread are auto-dismissed after 60s.
- **Unified sorting**: All sessions (pending, active, ended) are sorted by `created_at` descending in a single array, preventing visual reordering when sessions transition between states.

**Key ordering rules**:

- THREAD_CREATED can arrive before or after ACTIVE_SESSION_ENDED depending on timing. The client must handle both orderings.
- ACTIVE_SESSION_UPDATED with thread_id and THREAD_CREATED with matching source.session_id are redundant paths to linking. The client should accept whichever arrives first and ignore duplicates.
- The "idle" status (from Stop events) indicates the harness is waiting for input or has paused processing. "active" means it is actively processing.

## Network Resilience

Clients must handle WebSocket disconnections gracefully since session lifecycle events are ephemeral (not persisted or replayed).

### Reconnection Recovery

On WebSocket reconnect, the client should:

1. **Fetch active sessions**: `GET /api/active-sessions` returns current sessions from Redis. This recovers any ACTIVE_SESSION_STARTED events missed during disconnection. **Note**: This endpoint filters out sessions with archived threads and sessions that have neither a `thread_id` nor a `job_id` (e.g., very new sessions from other machines whose thread data hasn't synced yet).
2. **Check for thread linkage**: Active sessions returned from the REST endpoint include `thread_id` if already linked, recovering missed THREAD_CREATED events.
3. **Reconcile pending sessions**: Compare pending `job_id`s against active sessions' `job_id` fields to resolve any missed STARTED events.
4. **Fetch recent threads**: If the client tracks ended sessions, `GET /api/threads` can recover threads created during disconnection.

### Missed Event Scenarios

| Missed Event                | Recovery                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------- |
| ACTIVE_SESSION_STARTED      | GET /api/active-sessions will include it (if it has a thread_id or job_id)            |
| ACTIVE_SESSION_UPDATED      | GET /api/active-sessions returns current state                                        |
| ACTIVE_SESSION_ENDED        | Session will be absent from GET /api/active-sessions; client infers ended             |
| THREAD_CREATED              | Thread appears in GET /api/threads; active session may include thread_id              |
| THREAD_UPDATED              | GET /api/threads/<id> returns current metadata                                        |
| THREAD_TIMELINE_ENTRY_ADDED | Subscribe to thread after reconnect; fetch timeline via REST                          |
| THREAD_JOB_FAILED           | Check job status via BullMQ job API if pending session has no matching active session |

### Stale State Detection

Sessions in Redis have a TTL (default 10 minutes from last update). If a session's hooks stop firing (harness crash without SessionEnd), the Redis key expires and the session silently disappears. Clients should:

- Periodically poll GET /api/active-sessions to detect stale sessions that expired
- Treat a session absent from the REST response but still tracked locally as ended
- Not rely solely on ACTIVE_SESSION_ENDED for end-of-session detection

## Harness Integration Guide

### Required API Calls

Any AI harness integration must make these HTTP calls at the appropriate lifecycle points:

| Lifecycle Point | HTTP Call                                  | Required Fields                                                                              |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Session start   | `POST /api/active-sessions`                | `session_id`, `working_directory`, `transcript_path`; optional: `jsonl_session_id`, `job_id` |
| Activity/turn   | `PUT /api/active-sessions/<session_id>`    | `status: "active"`, `working_directory`, `transcript_path`; optional: `job_id`               |
| Idle/waiting    | `PUT /api/active-sessions/<session_id>`    | `status: "idle"`, `working_directory`, `transcript_path`; optional: `job_id`                 |
| Session end     | `DELETE /api/active-sessions/<session_id>` | (none)                                                                                       |

### Required Sync Operations

Before or concurrent with the activity PUT calls, the harness integration should:

1. **Convert session data to thread format**: Run the session import pipeline with the appropriate `--provider` flag
2. **Analyze thread relations**: Run `analyze-thread-relations.mjs` (throttled during session, forced at end)
3. **Auto-commit thread data**: Run `auto-commit-threads.sh` at session end
4. **Queue metadata analysis**: Append thread_id to `/tmp/claude-pending-metadata-analysis.queue`

### Session Provider Implementation

To add a new harness, implement a `SessionProviderBase` subclass in `libs-server/integrations/<provider>/` with:

- `find_sessions()` -- discover session transcript files
- `normalize_session()` -- convert to the common session format
- `validate_session()` -- validate session data integrity
- `get_inference_provider()` -- return the inference provider name
- `get_models_from_session()` -- extract model identifiers from session data
