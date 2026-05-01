---
title: Embedded Index Sync Pipeline
type: text
description: >-
  Streamers and extractors that populate the embedded SQLite index from filesystem entities and
  thread timelines, including per-turn extraction for the thread_timeline FTS5 index.
base_uri: sys:libs-server/embedded-database-index/sync/ABOUT.md
created_at: '2026-05-01T16:13:33.600Z'
entity_id: 1277a6d6-01ca-406a-860d-dae0c6385092
public_read: false
updated_at: '2026-05-01T16:13:33.600Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Embedded Index Sync Pipeline

## Purpose

Populate the embedded SQLite index (`entities`, `threads`, `thread_timeline`, plus their FTS5 shadows and the tag/relation join tables) from the filesystem source of truth. Each sync path must be idempotent: the full rebuild CLI and the incremental watcher share the same upsert primitives.

## Entries

- `stream-entity-files.mjs` — yields chunks of `{entity_properties, formatted_entity_metadata, file_info, entity_content}` for every markdown entity. `entity_content` was added for body indexing so the sync tier does not re-read files.
- `entity-data-extractor.mjs` — pure extractor; normalizes frontmatter + content into the row shape written by `sqlite-entity-sync.mjs`.
- `turn-extractor.mjs` — streams a thread's `timeline.jsonl` and emits one document per non-meta user turn (user content + subsequent assistant content + `Bash` tool-call commands).
- `sync-thread-timeline.mjs` — `sync_thread_timeline({thread_id})`: DELETE + batch INSERT into `thread_timeline`. No local mtime cache; the `EmbeddedIndexManager._timeline_sync_cache` already gates re-extraction in the live pipeline. Backfill always re-extracts (idempotent).
- `incremental-sync.mjs`, `resync-full-index.mjs`, `start-index-sync-watcher.mjs` — the three entry points; all eventually call the same upsert helpers.

## Timeline filter

Turns drop: `metadata.is_meta === true`, warmup patterns, `system/*` messages, `tool_result` blocks, `thinking` blocks. Everything else merges into the current turn until the next user message.

## Related

- [[sys:libs-server/embedded-database-index/ABOUT.md]] — table catalog.
- [[sys:libs-server/search/ABOUT.md]] — consumer of the FTS5 indexes populated here.
