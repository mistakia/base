---
title: Embedded Database Index
type: text
description: >-
  Overview of the SQLite-backed embedded index that projects filesystem entities, threads, tags,
  relations, aliases, content wikilinks, and thread references for fast querying and validation.
base_uri: sys:libs-server/embedded-database-index/ABOUT.md
created_at: '2026-04-20T05:32:13.996Z'
entity_id: 8a22fdfa-3e62-4ec8-b3c3-061e11d202fd
public_read: false
relations:
  - relates [[sys:system/text/reference-system.md]]
updated_at: '2026-04-20T05:32:13.996Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Embedded Database Index

Start here for the reference and alias model: [[sys:system/text/reference-system.md]].

## Purpose

This module maintains `embedded-index.db`, a SQLite database derived from the filesystem source of truth. It exists so agents and CLIs can answer back-reference, dangling-link, and tag/relation queries in O(index-lookup) without rescanning every markdown file.

## Tables

| Table                      | Source                                                   | Use                                                    |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| `entities`                 | Entity frontmatter + body                                | Primary entity metadata including `body` column for FTS; FTS via `entities_fts(title, description, body)`. |
| `entity_relations`         | Frontmatter `relations` strings                          | Typed edges; queried by `source` or `target`.          |
| `entity_tags`              | Frontmatter `tags` array                                 | Tag membership; each target is a tag entity.           |
| `entity_aliases`           | Frontmatter `aliases` array                              | Forwarding trail for move-preservation.                |
| `entity_content_wikilinks` | Body-content `[[...]]` wikilinks                         | Inline references; frontmatter is NOT duplicated here. |
| `thread_references`        | Thread `metadata.relations` + `metadata.file_references` | Back-refs from threads.                                |
| `threads`, `thread_tags`   | Thread `metadata.json`                                   | Thread metadata and tagging; FTS via `threads_fts`.    |
| `thread_timeline`          | Thread `timeline.jsonl` (per-turn extract)               | Conversation text for search; FTS via `thread_timeline_fts`. |
| `entity_embeddings`        | Embedding pipeline                                       | Semantic search.                                       |

## Sync pipeline

- `sqlite-entity-sync.mjs` upserts and prunes rows for every reference surface (relations, tags, aliases, content wikilinks) in lockstep with create/update/move/delete.
- `sync/entity-data-extractor.mjs` is the pure extractor layer; `sync/thread-data-extractor.mjs` does the same for threads and exposes `extract_thread_reference_targets` so the caller can populate `thread_references`.
- `stream-entity-files.mjs` yields each entity's full parsed form (including `formatted_entity_metadata.references`) so the batch populate path can fill every table without re-reading files.
- `drop_sqlite_schema()` in `sqlite-schema-definitions.mjs` drops every table the creator creates; keep it in sync when adding tables so `bun cli/rebuild-embedded-index.mjs` stays coherent.

## Resolution fallback

Callers that start from a `base_uri` should use `libs-server/entity/filesystem/resolve-entity-by-base-uri.mjs`, which falls back through `entity_aliases` when the primary path is missing. The synchronous `libs-server/base-uri/base-uri-utilities.mjs` registry is pure and MUST NOT take a DB dependency.
