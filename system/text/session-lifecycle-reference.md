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
public_read: true
relations:
  - relates_to [[sys:system/text/session-orchestrator.md]]
  - relates_to [[sys:system/text/execution-threads.md]]
  - relates_to [[sys:system/text/background-services.md]]
  - relates_to [[sys:system/text/thread-execution-attribution.md]]
updated_at: '2026-04-23T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
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

| Component                                            | Role                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Client**                                           | Submits prompt, receives thread_id + job_id, tracks via WebSocket                                                               |
| **Base API** (PM2: `base-api`)                       | REST endpoints + WebSocket server, manages thread state                                                                         |
| **BullMQ Queue** (Redis)                             | Job queue for session creation with concurrency control                                                                         |
| **AI Harness** (e.g. Claude CLI)                     | Spawned process that executes the prompt                                                                                        |
| **Hook Scripts**                                     | Fire during harness lifecycle, report state to API                                                                              |
| **Redis Store**                                      | Active session records with TTL (legacy sessions without THREAD_ID)                                                             |
| **Thread Watcher** (chokidar)                        | Filesystem watcher that detects thread file and timeline changes; maintains in-memory metadata cache with reverse session index |
| **Metadata Queue** (PM2: `metadata-queue-processor`) | Async title/description generation via Ollama                                                                                   |

### API Dual-Target

The hook scripts send requests to **both** the local API and the production API (configured via `config.production_url`). Clients connected to either endpoint will receive WebSocket events. This is relevant for network resilience -- a client connected to the remote API will still receive events from locally-running sessions.

### Harness-Specific: Claude Code Hooks

Claude Code provides a native hook system configured via `.claude/settings.local.json`. Hook scripts receive a JSON payload on stdin containing `session_id`, `transcript_path`, `cwd`, and `hook_event_name`. The hook event names map to Claude Code lifecycle stages:

| Claude Code Hook Event | Base Session Lifecycle Equivalent             |
| ---------------------- | --------------------------------------------- |
| `SessionStart`         | Session started (harness process began)       |
| `UserPromptSubmit`     | Turn started (new prompt being processed)     |
| `PostToolUse`          | Activity heartbeat (tool execution completed) |
| `Stop`                 | Session idle (harness waiting for input)      |
| `SessionEnd`           | Session ended (harness process exiting)       |

Other harnesses would need equivalent adapters that translate their lifecycle events into the same API calls. When `THREAD_ID` is set (thread-first sessions), hooks call `PUT /api/threads/:thread_id/session-status` for session state transitions. When `THREAD_ID` is not set (legacy/manual sessions), hooks fall back to POST/PUT/DELETE on `/api/active-sessions`.

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
Server validates
  |
  v
Generates thread_id and job_id via crypto.randomUUID()
  |
  v
Calls create_thread() with:
  thread_id (explicit), user_public_key, inference_provider: 'anthropic',
  models: [], thread_state: 'active', title: null,
  additional_metadata: { session_status: 'queued', prompt_snippet, job_id }
  |
  v
Appends the first user message via add_timeline_entry()
  |
  v
Enqueues BullMQ job with thread_id in job data, job_id as BullMQ jobId
  |
  v
Response: { thread_id, job_id, queue_position }
```

**Client state**: Thread exists immediately with `session_status: 'queued'` and `prompt_snippet`. No pending session map needed -- the panel renders from the thread directly.

**`execution_mode`**: Optional. Controls whether the harness spawns on the host or inside the Docker container. Defaults to the value of `config.threads.cli.default_execution_mode`.

**Thread creation details**: The route passes an explicit `thread_id` to `create_thread()`, bypassing deterministic ID generation (which requires a `session_id` that does not exist yet). The route then appends the user's prompt as the initial timeline entry via `add_timeline_entry()`. No `source` is passed -- the sync pipeline adds source data when the session completes. The thread watcher detects the new `metadata.json` and emits THREAD_CREATED.

### Phase 2: Job Processing (async, potentially queued)

```
BullMQ Worker picks up job (concurrency: 3, configurable via config.threads.queue.max_concurrent_jobs)
  |
  v
Reads thread_id from job.data
  |
  v
Updates session_status to 'starting' in thread metadata
  |
  v
Spawns AI harness process
  env: JOB_ID=<bullmq-job-id> THREAD_ID=<thread-uuid>
  cwd: <working_directory>
```

**Delay**: 0-N seconds depending on queue depth.

**THREAD_ID env var**: Forwarded to the CLI process (and to the container via `docker exec -e` in container mode) alongside `JOB_ID`. Hook scripts use `THREAD_ID` to update the correct thread without filesystem scanning.

**Session resume**: If job data includes an existing `session_id`, the harness is invoked in resume mode rather than creating a new session. This affects thread correlation since the thread may already exist.

**Job failure**: If the job fails (harness crash, timeout, etc.), the worker updates `session_status` to `'failed'` in the thread metadata. The thread remains visible and dismissable in the client.

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

When the local `execution_mode` routing variable resolves to `container_user`,
sessions run inside the per-user Docker container as the `node` user. The
local variable is derived from the canonical `thread.execution` attribution
on resume (a `container_name` starting with `base-user-` => `container_user`)
and from `thread_config` presence on create. The persisted attribution lives
in `thread.execution`; see [[sys:system/text/thread-execution-attribution.md]]
for the full shape and resume-permission rule.

This affects hook script behavior:

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
  +--> 1. sync-claude-session.sh (synchronous)
  |     |
  |     v
  |     Runs session import pipeline (creates/updates thread data)
  |     Throttle: 2s minimum between runs when THREAD_ID is set (reduced from 30s)
  |
  +--> 2. active-session-hook.sh (background, fire-and-forget)
        |
        v
        PUT /api/threads/:thread_id/session-status
          body: { session_status: "active", session_id }
          |
          v
        Server updates session_status in thread metadata.json (targeted field merge)
        Server writes source.session_id to thread metadata
          |
          v
        WS: THREAD_UPDATED (emitted directly, not via thread watcher debounce)
```

**Key**: The thread already exists from Phase 1 with `thread_id` known from submission time. The hook uses `THREAD_ID` env var to update the correct thread. The session status endpoint emits THREAD_UPDATED directly for immediate client feedback (bypassing the thread watcher's 2s debounce). The sync hook now fires on SessionStart (in addition to UserPromptSubmit/PostToolUse/SessionEnd), closing the manual-session visibility gap.

**`find_thread_for_session`**: Now uses an O(1) reverse index built from the thread watcher metadata cache, falling back to O(n) filesystem scan only when the index misses. For thread-first sessions where `THREAD_ID` is set, this lookup is not needed -- the thread_id is known.

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
        PUT /api/threads/:thread_id/session-status
          body: { session_status: "active" }
          |
          v
        Server updates session_status in thread metadata.json
          |
          v
        WS: THREAD_UPDATED (emitted directly)
```

**Key insight**: For thread-first sessions, the `thread_id` is known from submission time (Phase 1). The hook uses `THREAD_ID` env var to call the session-status endpoint directly, bypassing the old `find_thread_for_session` correlation. The sync script updates the thread with the latest session data (timeline entries, metadata).

#### PostToolUse (fires on each tool use)

```
PostToolUse hook fires
  |
  +--> 1. active-session-hook.sh (background, fire-and-forget)
  |     PUT /api/threads/:thread_id/session-status (when THREAD_ID set)
  |       body: { session_status: "active" }
  |       -> WS: THREAD_UPDATED (emitted directly)
  |     OR PUT /api/active-sessions/<session_id> (legacy, when THREAD_ID not set)
  |       body: { status: "active", job_id, working_directory, transcript_path }
  |       -> WS: ACTIVE_SESSION_UPDATED
  |
  +--> 2. sync-claude-session.sh (throttled: 2s when THREAD_ID set, 30s otherwise; lock-guarded)
        |
        v
        Throttle check: if last sync < threshold, exits immediately (<1ms)
          (2s when THREAD_ID env var is set, 30s otherwise)
        Lock check: if another sync is running, exits immediately
        |
        v (when not throttled)
        convert-external-sessions.mjs import --allow-updates
          -> Updates thread metadata.json and timeline.jsonl
          -> Passes known_thread_id when THREAD_ID is set (prevents duplicate creation)
          -> Thread watcher fires THREAD_UPDATED + THREAD_TIMELINE_ENTRY_ADDED
        |
        v
        analyze-thread-relations.mjs (throttled: minimum 300s between runs)
```

**Note**: PostToolUse runs the sync script with throttling. Most invocations exit in <1ms (throttle check). When THREAD_ID is set (web-client sessions), the throttle is reduced from 30s to 2s for faster timeline delivery. The server-side rate limit (`SYNC_RATE_LIMIT_MS`) is set to 1800ms to stay safely below the 2s shell interval and avoid clock granularity boundary races. The throttle file is cleaned up on SessionEnd.

#### Stop (fires when harness goes idle)

```
Stop hook fires
  |
  v
active-session-hook.sh (background, fire-and-forget)
  PUT /api/threads/:thread_id/session-status
    body: { session_status: "idle" }
    |
    v
  Server updates session_status in thread metadata.json
    |
    v
  WS: THREAD_UPDATED (emitted directly)
```

**Note**: The Stop event transitions `session_status` to "idle", distinct from "active". Clients should use this to show the session is waiting for input or has paused. Stop does NOT run the sync script (PostToolUse handles periodic sync).

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
  |       -> Passes known_thread_id when THREAD_ID is set (prevents duplicate creation)
  |       -> Bypasses server-side rate limit (1800ms) unconditionally for SessionEnd
  |       -> Thread watcher fires THREAD_UPDATED + THREAD_TIMELINE_ENTRY_ADDED
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
        PUT /api/threads/:thread_id/session-status
          body: { session_status: "completed" }
          |
          v
        Server updates session_status in thread metadata.json
          |
          v
        WS: THREAD_UPDATED (emitted directly)
```

**Ordering**: The SessionEnd hooks fire sequentially. The sync script runs FIRST (up to 30s). The session hook runs SECOND. The sync script's final import bypasses the server-side rate limit unconditionally -- SessionEnd is the final sync opportunity and must never be dropped. The session status endpoint emits THREAD_UPDATED directly so the client sees the `session_status: 'completed'` transition immediately.

**Metadata write contention**: The SessionEnd sync and the session-status update can race on `metadata.json`. Both writers use a targeted field merge pattern (read fresh state, patch only their specific fields, write). The session-status endpoint owns `session_status` and `source`; the sync pipeline owns `models`, `inference_provider`, counts, `title`, and timeline data.

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

### ACTIVE_SESSION_STARTED / ACTIVE_SESSION_UPDATED / ACTIVE_SESSION_ENDED

**Legacy events**: These events are still emitted for backward compatibility with sessions that do not have a `THREAD_ID` (manually started CLI sessions without the thread-first flow). For thread-first sessions, the primary state channel is THREAD_UPDATED events carrying `session_status` transitions. See THREAD_UPDATED below.

The legacy event payloads remain unchanged from the original format. Clients implementing the thread-first architecture should prefer THREAD_UPDATED for session state and use these events only as a fallback for non-thread-first sessions.

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

Same payload structure as THREAD_CREATED, plus `session_status` and `prompt_snippet` fields when present. Emitted when metadata.json is modified -- this includes session state transitions (via the `PUT /api/threads/:thread_id/session-status` endpoint, which emits directly for immediate feedback), metadata analysis title generation, and sync pipeline updates (UserPromptSubmit/SessionEnd). In the thread-first architecture, this is the primary event for tracking session lifecycle state.

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
    "thread_id": "string | null",
    "error_message": "string"
  }
}
```

**Emitted**: When the BullMQ job fails (harness crash, timeout, etc.).
**Broadcast**: Sent to all authenticated WebSocket clients without permission filtering (since there is no thread to check permissions against). Clients match by `job_id` to correlate with the thread.
**thread_id**: In the thread-first architecture, always non-null for web-client sessions (the thread exists from submission time). The job worker also updates `session_status` to `'failed'` in the thread metadata. Null only for legacy jobs without a pre-created thread.

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

**Emitted**: When the BullMQ worker picks up a job and begins executing. In the thread-first architecture, this is emitted for all web-client sessions (since `job.data.thread_id` is always set). For manually started sessions without a thread, this event is not emitted.
**Broadcast**: Sent to all authenticated WebSocket clients without permission filtering.
**Client use**: Clients using the thread-first flow receive `session_status: 'starting'` via THREAD_UPDATED instead. This event remains useful for resume jobs and legacy clients.

## Debug Tracing

### Server-Side Tracing

Enable the `base:session-lifecycle` debug namespace to trace the full session lifecycle on the server:

```bash
DEBUG=base:session-lifecycle node server/...
# or append to existing DEBUG patterns:
DEBUG=api:*,base:session-lifecycle node server/...
```

Trace output includes structured log entries at every state transition:

- **Routes** (`active-sessions.mjs`, `threads.mjs`): POST/PUT/DELETE with session_id, job_id, thread_id; session-status PUT with thread_id and session_status transitions
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
- **WebSocket service**: All incoming `ACTIVE_SESSION_*` and `THREAD_*` messages with key IDs

Disable with `localStorage.removeItem('debug:session-lifecycle')`.

## Early Session Clickability

Sessions are clickable immediately from submission, since the thread exists from Phase 1. The flow:

1. Client submits prompt -- receives `thread_id` in the create-session response
2. Thread is created on disk with `session_status: 'queued'`, `prompt_snippet`, and the user's prompt as the initial timeline entry
3. Panel renders the thread immediately with the prompt snippet as display text and a session status indicator
4. Clicking opens the thread sheet directly (no intermediate session sheet needed)
5. As the session progresses, THREAD_UPDATED events update `session_status` and the sync pipeline appends timeline entries
6. The client auto-subscribes to the thread's timeline for live updates (SUBSCRIBE_THREAD)

No sheet key transitions are needed -- the thread_id is stable from the start.

## Correlation Keys

The thread-first architecture simplifies correlation. The `thread_id` is known from submission time, eliminating the previous three-map correlation flow (job_id -> session_id -> thread_id).

| Identifier          | Source                              | Available When               | Purpose                                                    |
| ------------------- | ----------------------------------- | ---------------------------- | ---------------------------------------------------------- |
| `thread_id`         | `crypto.randomUUID()` at submission | From create-session response | Primary identity for the session throughout its lifecycle  |
| `job_id`            | `crypto.randomUUID()` at submission | From create-session response | BullMQ job correlation, stored in thread metadata          |
| `session_id`        | AI harness session UUID             | From SessionStart hook       | Identifies the harness session, written to thread metadata |
| `source.session_id` | Thread metadata                     | After SessionStart fires     | Links thread back to the harness session_id                |

### Correlation Flow

```
thread_id (client has this from create-session response)
  |-- used directly for all operations:
  |     thread panel rendering, timeline subscription, navigation
  |
  |-- session_status transitions arrive as THREAD_UPDATED events
  |     on the same thread_id (no correlation needed)
  |
  |-- job_id stored in thread metadata for BullMQ job tracking
```

**Legacy flow**: For sessions started manually (not via the web client), the thread is created by the sync hook on SessionStart. These sessions use the original `find_thread_for_session` correlation path, now backed by an O(1) reverse index from the thread watcher metadata cache.

## Timing Characteristics

| Event                                      | Typical Delay After Previous                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| create-session response (with thread_id)   | < 1 second (thread created synchronously before response)                            |
| THREAD_CREATED (watcher detection)         | ~500ms after create-session (thread watcher detects metadata.json)                   |
| BullMQ job pickup                          | 0-30 seconds (depends on queue)                                                      |
| THREAD_UPDATED (session_status: starting)  | Immediate on job pickup                                                              |
| Harness startup                            | 2-5 seconds (varies by harness)                                                      |
| THREAD_UPDATED (session_status: active)    | Immediate after SessionStart hook fires                                              |
| Periodic thread updates (PostToolUse)      | Every ~2s during active tool use (throttled sync, when THREAD_ID set; 30s otherwise) |
| THREAD_UPDATED (session_status: completed) | After all SessionEnd hooks complete                                                  |
| THREAD_UPDATED (with generated title)      | Seconds to minutes (async Ollama)                                                    |

## Client State Machine

The thread-first architecture simplifies client state. The active-sessions reducer is a thin ephemeral store keyed by `session_id` holding only transient fields: `{ thread_id, latest_timeline_event, context_percentage, last_activity_at }`. No more `pending_sessions`, `ended_sessions`, or `prompt_snippets` maps. The panel renders threads directly, enriched with ephemeral data where available.

The canonical lifecycle SSOT lives in `libs-shared/thread-lifecycle.mjs`. It exports the full six-state set (`queued | starting | active | idle | completed | failed`), the `LIVE_STATUSES` and `TERMINAL_STATUSES` partitions used for active-sessions routing and reverse indexing, the `STATUS_LABEL` / `STATUS_GLYPH` / `STATUS_COLOR_TOKEN` / `STATUS_SHOWS_SPINNER` lookup tables, the `ACTIVE_VERBS` pool, and the `pick_active_verb({ thread_id, turn_count })` helper. Server (active-sessions route, thread-watcher), web client (ThreadLifecycleIndicator), and iOS (`BaseApp/Shared/Utils/ThreadLifecycle.swift` mirror) all import from this canonical model so display rules cannot drift. The legacy four-state `libs-shared/session-status-display.mjs` is removed.

### Display Contract

Both clients render lifecycle status via a single component (`ThreadLifecycleIndicator` on web, `ThreadLifecycleIndicatorView` on iOS) consuming the canonical module. The component has two variants: `footer` (full text, Braille spinner on `active`, used at the bottom of an open thread) and `inline` (compact, no spinner, used in headers, panel rows, and thread cards).

| Status      | Label             | Inline glyph | Caret | Footer spinner | Color token       |
| ----------- | ----------------- | ------------ | ----- | -------------- | ----------------- |
| `queued`    | Queued            | `\u2022`     | none  | false          | `info`            |
| `starting`  | Starting          | `\u2022`     | none  | false          | `info`            |
| `active`    | (verb) + `...`    | `\u2022`     | `\u203A` | true        | `success`         |
| `idle`      | Awaiting input    | `\u2022`     | none  | false          | `warning`         |
| `completed` | Completed         | `\u2713`     | none  | false          | `text_secondary`  |
| `failed`    | Failed            | `\u2715`     | none  | false          | `error`           |

For `active`, the verb is selected deterministically as `ACTIVE_VERBS[(djb2_hash(thread_id) + thread.user_message_count) mod ACTIVE_VERBS.length]`. The `user_message_count` key advances exactly once per agent turn (at UserPromptSubmit) and is stable for the duration of the turn, so the verb does not change mid-turn and survives reload. The Braille spinner cycles through ten frames at 120ms per frame (1200ms full cycle) and is the only animation rendered by either client.

THREAD_UPDATED emits are gated through `libs-server/threads/should-emit-thread-updated.mjs`, which suppresses redundant emits when no client-rendered field has changed.

Session state is driven by the `session_status` field on the thread metadata:

```
QUEUED (thread exists, session_status: "queued", clickable: yes)
  |
  |-- THREAD_UPDATED (session_status: "starting") --> STARTING
  |-- THREAD_JOB_FAILED (matching job_id) ----------> FAILED (session_status: "failed")
  v
STARTING (session_status: "starting", clickable: yes)
  |
  |-- THREAD_UPDATED (session_status: "active") --> ACTIVE
  v
ACTIVE (session_status: "active", clickable: yes)
  |
  |-- THREAD_UPDATED (session_status: "idle") ----> IDLE
  |-- THREAD_UPDATED (session_status: "completed") -> COMPLETED
  v
IDLE (session_status: "idle", clickable: yes)
  |
  |-- THREAD_UPDATED (session_status: "active") --> ACTIVE
  |-- THREAD_UPDATED (session_status: "completed") -> COMPLETED
  v
COMPLETED (session_status: "completed", clickable: yes)
  |
  |-- session_status cleared (set to null) by metadata analysis or manual action
  v
NORMAL THREAD

FAILED (session_status: "failed", clickable: yes, dismissable)
  |
  |-- manual dismiss or retry
  v
REMOVED / RETRIED
```

**Key behavioral changes**:

- **Immediate clickability**: Sessions are clickable from the moment the thread is created (Phase 1), before the harness even starts. The `prompt_snippet` in thread metadata provides display text immediately.
- **State survives refresh**: Because `session_status` and `prompt_snippet` are persisted in thread metadata, all session state survives page refresh. No more ephemeral client-only state.
- **Single sorted list**: The panel renders a single list of threads with active `session_status`, sorted by `created_at` descending. No separate pending/active/ended collections.
- **No correlation needed**: The `thread_id` is the stable identity from submission time. THREAD_UPDATED events carry `session_status` transitions directly on the thread.

**Key ordering rules**:

- All session state transitions arrive as THREAD_UPDATED events on the same `thread_id`.
- The client auto-subscribes to active thread timelines (SUBSCRIBE_THREAD) for threads with active `session_status` belonging to the current user.
- The "idle" status (from Stop events) indicates the harness is waiting for input or has paused processing. "active" means it is actively processing.

## Network Resilience

Clients must handle WebSocket disconnections gracefully since session lifecycle events are ephemeral (not persisted or replayed).

### Reconnection Recovery

On WebSocket reconnect, the client should:

1. **Fetch active threads**: `GET /api/threads` with a filter for threads with active `session_status` (queued, starting, active, idle) returns all in-progress sessions. Since `session_status` is persisted in thread metadata, this recovers all session state -- no separate session store query needed.
2. **Re-subscribe to timelines**: For each active thread, send SUBSCRIBE_THREAD to resume live timeline updates.
3. **Legacy sessions**: `GET /api/active-sessions` still returns Redis-based sessions for non-thread-first sessions (manually started CLI sessions without THREAD_ID).

### Missed Event Scenarios

| Missed Event                | Recovery                                                                          |
| --------------------------- | --------------------------------------------------------------------------------- |
| THREAD_CREATED              | Thread appears in GET /api/threads; session_status indicates lifecycle stage      |
| THREAD_UPDATED              | GET /api/threads/<id> returns current metadata including session_status           |
| THREAD_TIMELINE_ENTRY_ADDED | Subscribe to thread after reconnect; fetch timeline via REST                      |
| THREAD_JOB_FAILED           | Thread metadata has session_status: "failed"; visible in GET /api/threads         |
| ACTIVE_SESSION_STARTED      | Legacy: GET /api/active-sessions will include it (non-thread-first sessions only) |
| ACTIVE_SESSION_UPDATED      | Legacy: GET /api/active-sessions returns current state                            |
| ACTIVE_SESSION_ENDED        | Legacy: Session absent from GET /api/active-sessions; client infers ended         |

### Stale State Detection

For thread-first sessions, `session_status` is persisted in thread metadata and does not expire. If a session's hooks stop firing (harness crash without SessionEnd), the thread retains its last `session_status` (e.g., "active" or "starting") indefinitely. Clients should:

- Detect stale sessions by checking `last_activity_at` or thread `updated_at` against a staleness threshold
- Treat threads with active `session_status` but no recent activity as potentially stale
- The job worker sets `session_status: 'failed'` on job failure, which handles most crash scenarios

For legacy sessions (Redis store), the TTL behavior (default 10 minutes) still applies.

## Harness Integration Guide

### Required API Calls

Any AI harness integration must make these HTTP calls at the appropriate lifecycle points:

When `THREAD_ID` is set (thread-first sessions):

| Lifecycle Point | HTTP Call                                    | Required Fields                          |
| --------------- | -------------------------------------------- | ---------------------------------------- |
| Session start   | `PUT /api/threads/:thread_id/session-status` | `session_status: "active"`, `session_id` |
| Activity/turn   | `PUT /api/threads/:thread_id/session-status` | `session_status: "active"`               |
| Idle/waiting    | `PUT /api/threads/:thread_id/session-status` | `session_status: "idle"`                 |
| Session end     | `PUT /api/threads/:thread_id/session-status` | `session_status: "completed"`            |

When `THREAD_ID` is not set (legacy/manual sessions):

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

### Pi Provider

Pi (the badlogic/pi-mono coding agent) deviates from the per-session contract because its `.jsonl` files encode multiple branches via `id`/`parentId` references. The provider yields one raw session per branch from `find_sessions` / `stream_sessions`, so the unified thread-creation layer creates one thread per branch without structural changes. Specifics:

- **Branch fan-out**: `extract_all_pi_branches` walks every leaf to root; branch index 0 is the most recent leaf and acts as the primary branch. Per-branch `session_id` is `<header.id>-branch-<index>`.
- **Cross-thread linker (post-processing)**: `pi-branch-linker.mjs` runs after `create_threads_from_session_provider` returns. It groups created/updated threads by `original_session_id`, adds `branched_from` relations between siblings, and backfills `metadata.branch_thread_id` on `branch_point` timeline entries.
- **Header version gating**: `validate_pi_header` rejects any session whose `header.version` is not 1, 2, or 3. v1 (linear) and v2 (`hookMessage` role) auto-migrate to v3 shape on read.
- **Migration safety**: `migrate_pi_entries` lands every chat message with outer `type: 'message'` (role carries user/assistant). This avoids `is_warm_session` Patterns 1 and 2 false-skipping Pi sessions.
- **Raw-data persistence**: skipped. `PiSessionProvider.supports_raw_data === false` makes the dispatcher pass `null` for `raw_session_data` and the post-write integrity check ignores the `raw-data/` directory.
- **Unsupported tracking**: entry-level `custom` (extension state, not in LLM context) is recorded once via the unsupported tracker so importers see what was dropped.
- **Label preservation**: Pi `label` entries become `system` / `system_type=status` with `metadata.extension_type='pi_label'` and the label text on both `content` and `metadata.label_text`.
