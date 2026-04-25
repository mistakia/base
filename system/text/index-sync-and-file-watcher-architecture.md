---
title: Index Sync and File Watcher Architecture
type: text
description: >-
  Architecture of the embedded database index sync pipeline: file watchers, IPC queue mechanism,
  event routing, reconciliation strategies, and platform considerations
base_uri: sys:system/text/index-sync-and-file-watcher-architecture.md
created_at: '2026-04-03T15:00:00.000Z'
entity_id: 620518a8-2185-4117-a88b-96b93c57dba3
public_read: false
relations:
  - relates_to [[sys:system/text/database-and-indexing.md]]
  - relates_to [[sys:system/text/background-services.md]]
updated_at: '2026-04-03T15:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

## Overview

The embedded database index maintains a SQLite mirror of filesystem entities and threads for fast querying. The index sync service runs as a standalone PM2 process that owns all SQLite writes. The API server and CLI tools read from the database. File changes are detected through a combination of native OS watchers and polling.

## Sync Pipeline

```
Filesystem (source of truth)
    |
    v
File Watchers (detect changes)
    |
    +---> Entity .md files: @parcel/watcher on user-base directory
    +---> Thread metadata: @parcel/watcher on thread/ directory
    +---> Git internals: chokidar on .git file patterns
    |
    v
IPC Queues (cross-process communication)
    |   Thread sync: API writes per-request files under thread-sync-queue/ (fs.watch)
    |   Entity change: sync service writes to .entity-change-queue (poll 2s)
    |
    v
Index Sync Service (sole SQLite writer)
    |
    +---> Entity changes: direct from user-base watcher
    +---> Thread changes: reads metadata from disk, extracts fields
    +---> Upserts to embedded-database-index/sqlite.db
    +---> Writes entity change notifications to IPC queue
    |
    v
Base-API (cache invalidation via entity-change-ipc)
    +---> Receives entity change notifications from sync service
    +---> Invalidates tasks cache (replaces direct entity_index callbacks)
```

## File Watcher Strategy

Four watcher strategies serve different scope and reliability needs:

| Watcher                          | Library                 | Scope                                   | Consumer                                              |
| -------------------------------- | ----------------------- | --------------------------------------- | ----------------------------------------------------- |
| User-base watcher (sync service) | @parcel/watcher         | user-base/ (recursive, with exclusions) | Entity sync to SQLite                                 |
| User-base watcher (base-api)     | @parcel/watcher         | user-base/ (recursive, with exclusions) | WebSocket file notifications, repo unstaged detection |
| Thread watcher                   | @parcel/watcher         | thread/ (recursive)                     | Thread metadata/timeline changes                      |
| Git status watcher               | chokidar                | ~280 specific .git file patterns        | Git index, HEAD, refs changes                         |
| Thread sync IPC                  | fs.watch (dir, 50ms)    | thread-sync-queue/ per-request files    | Thread sync request forwarding                        |
| Entity change IPC                | polling (2s setTimeout) | .entity-change-queue file               | Entity change notification to base-api                |

### Library Selection Rationale

- **@parcel/watcher**: Directory-level native OS watchers (FSEvents on macOS, inotify on Linux). Low overhead for broad directory trees. Cannot filter to specific file patterns within a directory.
- **chokidar**: File-level watching with glob pattern support. Required for git-status-watcher which watches specific patterns like `refs/heads/**` across ~280 files. Not worth migrating to @parcel/watcher for this use case.
- **Polling (setTimeout)**: Used for the entity-change-queue (single append-only file). Immune to FSEvents event drops. 2-second interval with sequential execution via recursive setTimeout. Cross-platform reliable.
- **fs.watch (directory)**: Used for the thread-sync-queue. Each enqueue creates a fresh per-request file under a stable directory inode, so Bun's `fs.watch` reliably surfaces a "rename" entry-create event. A 60-second `setInterval` poll runs as a dropped-event safety net. See "Bun fs.watch quirk" below.

### User-Base Watcher Event Routing

The user-base watcher creates a single @parcel/watcher subscription and routes events by path:

1. **repository/** events route to `repo_file` handler (git status detection), then stop
2. Events in excluded directories (thread, .git, node_modules, import-history, embedded-database-index) are dropped
3. Events in hidden directories (`.` prefix) are dropped
4. Remaining events route to `file_subscription` (WebSocket notifications) if provided
5. `.md` files in entity directories additionally route to `entity_index` (SQLite sync) if provided

Note: base-api no longer passes `entity_index` callbacks to its user-base watcher. Entity change notifications arrive via entity-change-ipc instead. Only the index-sync-service uses entity_index callbacks for direct SQLite sync.

Entity directories: task, tag, guideline, text, workflow, physical-item, physical-location, person, role, identity, scheduled-command, extension.

### Ignore Patterns

The @parcel/watcher subscription excludes these paths to reduce event volume:

**Default (all watchers)**: `.git`, `node_modules`, `*.swp`, `*~`, `.DS_Store`

**User-base watcher**: `dist`, `build`, `.cache`, `coverage`, `tmp`, `.turbo`, `.next`, `archive`, `thread`, `import-history`, `embedded-database-index`, `database`, `data`, `files`

### FSEvents Reliability and Reconciliation

On macOS, @parcel/watcher uses FSEvents which has a kernel event buffer. High filesystem activity can cause event drops with: `Events were dropped by the FSEvents client.`

Both watchers implement error recovery:

- **Thread watcher**: On error, runs a reconciliation scan comparing tracked inode/size state against filesystem to detect and re-emit missed changes.
- **User-base watcher**: On error, scans all entity directories for `.md` files and re-emits them as change events. Debounced at 5 seconds to coalesce rapid error bursts.

## Thread Sync IPC

The API and sync service run in separate PM2 processes. Thread state changes flow through a per-request file IPC queue under `embedded-database-index/thread-sync-queue/`. The implementation lives in `libs-server/embedded-database-index/sync/thread-sync-ipc.mjs`.

1. **Writer (API)**: The thread watcher debounces by `thread_id` (50ms) to coalesce metadata.json + timeline.jsonl writes from the same tick, then atomically writes a single request file at `thread-sync-queue/<ts>-<pid>-<uuid>.req`. Each enqueue is a fresh inode in a stable parent directory.
2. **Reader (sync service)**: A `fs.watch` subscription on the queue directory fires a "rename" entry-create event for each new `.req` file and schedules `process_queue` after a 50ms debounce. A 60-second `setInterval` runs as a safety-net poll for any missed event.
3. **Processing**: `process_queue` reads every pending `.req` file, deduplicates by `thread_id` with last-write-wins (delete entries supersede preceding syncs; a sync after a delete is resurrected), invokes `on_thread_sync` / `on_thread_delete` per thread, then unlinks the processed files. A reentrancy guard plus `pending_reprocess` flag re-runs once after the current pass if `fs.watch` fires mid-batch.
4. **Crash recovery**: Each request file is an atomic write. Files left behind by a mid-drain crash are picked up on the next consumer start; idempotent SQLite UPSERTs make duplicate reads harmless.
5. **Legacy migration**: A single one-shot drain of the prior `.thread-sync-queue` append-only file runs on startup if present, then the file is unlinked.

Request payloads are one of:
- JSON object `{"thread_id":"...","metadata":{...}}` when the writer has metadata in scope (skips a consumer disk re-read)
- bare `{thread_id}` when the writer does not (consumer re-reads `metadata.json`)
- `DELETE:{thread_id}` for removals

### Queue Overflow Recovery

When the queue directory accumulates more than `MAX_QUEUE_FILES` (10,000) `.req` entries, the consumer flags `has_overflow` and invokes `on_overflow`, which triggers a full thread directory re-scan via `_populate_threads_from_filesystem()`. Overflow events are tracked by metrics.

## Entity Change IPC

Entity change notifications flow from the index-sync-service to base-api via a second IPC queue. This replaces base-api's direct entity_index callbacks on the user-base watcher, eliminating redundant cache invalidation from filesystem events.

1. **Writer (sync service)**: After successful `sync_entity()` or `remove_entity()`, appends `{event_type}:{base_uri}\n` to `embedded-database-index/.entity-change-queue`. IPC writes are skipped during bulk resync (`skip_ipc: true`) to avoid N syscalls per entity.
2. **Reader (base-api)**: Polls queue file every 2 seconds
3. **Processing**: Same atomic rename pattern as thread-sync-ipc. Deduplicates by base_uri (latest event_type per URI wins). Dispatches a single batch notification per queue flush (not per entry).
4. **Consumer**: Each batch triggers a single `invalidate_tasks_cache()` in base-api

Event types: `update`, `delete`. Queue line format: `update:user:task/my-task.md`. Size limit: 1MB.

## Dual-Process Architecture

Two PM2 processes each start a user-base watcher subscription:

| Process            | Watcher Consumers            | IPC                                                 | Purpose                                  |
| ------------------ | ---------------------------- | --------------------------------------------------- | ---------------------------------------- |
| base-api           | file_subscription, repo_file | Reads entity-change-queue                           | Real-time UI updates, cache invalidation |
| index-sync-service | entity_index (SQLite upsert) | Writes entity-change-queue, reads thread-sync-queue | Durable index maintenance                |

Both create independent @parcel/watcher subscriptions on the same user-base directory. Base-api no longer receives entity_index callbacks via the watcher -- cache invalidation arrives through entity-change-ipc instead, reducing redundant processing of entity file events in the API process.

## Key Modules

| Module                                                             | Role                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `libs-server/file-subscriptions/user-base-watcher.mjs`             | Consolidated @parcel/watcher with event routing and reconciliation |
| `libs-server/file-subscriptions/parcel-watcher-adapter.mjs`        | Shared adapter with default ignore patterns and error callback     |
| `libs-server/file-subscriptions/git-status-watcher.mjs`            | Chokidar-based .git internal file watching                         |
| `libs-server/embedded-database-index/sync/thread-sync-ipc.mjs`     | Per-request file IPC queue with fs.watch for thread sync forwarding |
| `libs-server/embedded-database-index/sync/entity-change-ipc.mjs`   | Polling-based IPC queue for entity change notifications            |
| `libs-server/embedded-database-index/sync/sync-metrics.mjs`        | In-process metrics collection with periodic log dump               |
| `libs-server/embedded-database-index/sync/stream-entity-files.mjs` | Async generator for streaming entity population                    |
| `server/services/thread-watcher.mjs`                               | @parcel/watcher for thread directory with reconciliation           |
| `server/services/index-sync-service.mjs`                           | PM2 service entry point for SQLite sync                            |
| `libs-server/embedded-database-index/embedded-index-manager.mjs`   | SQLite lifecycle, sync operations, query interface                 |

## Metrics and Observability

The sync-metrics module provides lightweight in-process metrics collection. All output uses `console.error` because the Bun runtime suppresses `debug()` npm package output in PM2 log files -- only stderr reaches the logs.

**Heartbeat** (every 60 seconds):

```
[heartbeat] pid=N uptime_s=N sqlite_ready=bool last_sync_age_s=N cache_size=N
```

**Metrics dump** (every 5 minutes, counters reset after dump):

```
[metrics] entity_syncs=N thread_syncs=N reconciliations=N errors=N avg_entity_sync_ms=N avg_thread_sync_ms=N cache_hits=N cache_misses=N queue_depth=N overflow_events=N uptime_s=N
```

Instrumented operations: entity sync/delete counts and timing, thread sync/delete counts and timing, timeline cache hits/misses, reconciliation count/timing/file count, FSEvents errors, IPC queue depth/syncs/deletes/timeouts/overflows.

## Periodic WAL Checkpoint

The index-sync-service runs a periodic WAL checkpoint every 10 minutes via `setInterval` to prevent unbounded WAL growth during sustained write periods. The interval is unreffed so it does not prevent process exit.

## Timeline Cache Bounding

The timeline sync cache (`_timeline_sync_cache`) stores timeline extraction results keyed by thread_id to skip re-extraction when only metadata changes. The cache is capped at 5,000 entries -- when the cap is exceeded, the oldest entries are evicted using Map insertion-order iteration. Cache size is reported as a metrics gauge.

## Recovery and Rebuild

The sync service startup performs incremental sync with automatic fallback: incremental (git diff) -> resync (full scan) -> reset and rebuild (drop and recreate).

### Streaming Population

Both rebuild and resync paths use streaming entity population to reduce peak memory from O(all entities) to O(chunk size). The `stream_entity_file_chunks` async generator walks entity directories with `fs.readdir`, reads and parses each `.md` file, and yields arrays of entities in chunks (default 100). This prevents OOM during schema version upgrades that trigger full rebuilds.

For resync, entities are streamed while collecting `base_uri` strings into a Set for orphan detection. The URI Set (strings only) remains in memory but is much smaller than full parsed entity objects.

Thread population uses `list_thread_ids()` which returns only UUID strings (~36 bytes each), then `process_threads_in_batches()` loads metadata per-batch (100 at a time). The thread ID list is bounded and acceptable.

Manual recovery:

- `bun cli/rebuild-embedded-index.mjs` -- full index rebuild from filesystem
- `pm2 restart index-sync-service` -- drains pending queue on startup
