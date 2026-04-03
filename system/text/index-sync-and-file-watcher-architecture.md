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
IPC Queue (cross-process communication)
    |   API writes thread_id lines to .thread-sync-queue file
    |   Sync service polls queue every 5s via recursive setTimeout
    |
    v
Index Sync Service (sole SQLite writer)
    |
    +---> Entity changes: direct from user-base watcher
    +---> Thread changes: reads metadata from disk, extracts fields
    +---> Upserts to embedded-database-index/sqlite.db
```

## File Watcher Strategy

Four watcher strategies serve different scope and reliability needs:

| Watcher | Library | Scope | Consumer |
|---------|---------|-------|----------|
| User-base watcher | @parcel/watcher | user-base/ (recursive, with exclusions) | Entity sync, WebSocket notifications, repo unstaged detection |
| Thread watcher | @parcel/watcher | thread/ (recursive) | Thread metadata/timeline changes |
| Git status watcher | chokidar | ~280 specific .git file patterns | Git index, HEAD, refs changes |
| Thread sync IPC | polling (setTimeout) | Single queue file | Thread sync request forwarding |

### Library Selection Rationale

- **@parcel/watcher**: Directory-level native OS watchers (FSEvents on macOS, inotify on Linux). Low overhead for broad directory trees. Cannot filter to specific file patterns within a directory.
- **chokidar**: File-level watching with glob pattern support. Required for git-status-watcher which watches specific patterns like `refs/heads/**` across ~280 files. Not worth migrating to @parcel/watcher for this use case.
- **Polling (setTimeout)**: Used for single IPC queue files. Immune to FSEvents event drops. 5-second interval with sequential execution via recursive setTimeout. Cross-platform reliable.

### User-Base Watcher Event Routing

The user-base watcher creates a single @parcel/watcher subscription and routes events by path:

1. **repository/** events route to `repo_file` handler (git status detection), then stop
2. Events in excluded directories (thread, .git, node_modules, import-history, embedded-database-index) are dropped
3. Events in hidden directories (`.` prefix) are dropped
4. Remaining events route to `file_subscription` (WebSocket notifications)
5. `.md` files in entity directories additionally route to `entity_index` (SQLite sync)

Entity directories: task, tag, guideline, text, workflow, physical-item, physical-location.

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

The API and sync service run in separate PM2 processes. Thread state changes flow through a file-based IPC queue:

1. **Writer (API)**: Thread watcher detects metadata.json change, appends `{thread_id}\n` to `embedded-database-index/.thread-sync-queue`
2. **Reader (sync service)**: Polls queue file every 5 seconds
3. **Processing**: Atomically renames queue to `.processing`, deduplicates entries, processes each sync/delete, removes `.processing` file
4. **Crash recovery**: Detects leftover `.processing` files on startup and resumes

Delete requests use `DELETE:{thread_id}` prefix and take precedence over sync requests for the same thread.

## Dual-Process Architecture

Two PM2 processes each start a user-base watcher subscription:

| Process | Consumers | Purpose |
|---------|-----------|---------|
| base-api | file_subscription, entity_index (cache invalidation), repo_file | Real-time UI updates |
| index-sync-service | entity_index (SQLite upsert) | Durable index maintenance |

Both create independent @parcel/watcher subscriptions on the same user-base directory. The index-sync-service only uses entity_index callbacks but receives all events through the shared watcher.

## Key Modules

| Module | Role |
|--------|------|
| `libs-server/file-subscriptions/user-base-watcher.mjs` | Consolidated @parcel/watcher with event routing and reconciliation |
| `libs-server/file-subscriptions/parcel-watcher-adapter.mjs` | Shared adapter with default ignore patterns and error callback |
| `libs-server/file-subscriptions/git-status-watcher.mjs` | Chokidar-based .git internal file watching |
| `libs-server/embedded-database-index/sync/thread-sync-ipc.mjs` | Polling-based IPC queue for thread sync forwarding |
| `server/services/thread-watcher.mjs` | @parcel/watcher for thread directory with reconciliation |
| `server/services/index-sync-service.mjs` | PM2 service entry point for SQLite sync |
| `libs-server/embedded-database-index/embedded-index-manager.mjs` | SQLite lifecycle, sync operations, query interface |

## Recovery and Rebuild

The sync service startup performs incremental sync with automatic fallback: incremental (git diff) -> resync (full scan) -> reset and rebuild (drop and recreate).

Manual recovery:
- `bun cli/rebuild-embedded-index.mjs` -- full index rebuild from filesystem
- `pm2 restart index-sync-service` -- drains pending queue on startup
