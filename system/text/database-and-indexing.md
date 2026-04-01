---
title: Database and Indexing
type: text
description: >-
  Reference for the embedded SQLite index architecture, entity storage strategy, multiple storage
  backends (DuckDB, PostgreSQL, TSV, Markdown), rebuild/sync operations, and relation storage
created_at: '2026-03-02T06:35:05.693Z'
entity_id: b4419d33-696c-42bb-b93a-1a6b7c8d21a0
base_uri: sys:system/text/database-and-indexing.md
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/search-system-design.md]]
  - relates_to [[sys:system/schema/database.md]]
updated_at: '2026-03-02T06:35:05.693Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Database and Indexing

The system uses a dual-database architecture: an embedded SQLite index for fast entity and thread querying, and a configurable multi-backend storage system for user-defined structured data collections.

## Embedded Database Index

A singleton SQLite embedded database indexes all entities and threads for fast querying and search. The index is a derived cache that can be rebuilt from filesystem sources at any time.

### Schema Tables

| Table                    | Purpose                              | Primary Key                                         |
| ------------------------ | ------------------------------------ | --------------------------------------------------- |
| `entities`               | Unified storage for all entity types | `base_uri`                                          |
| `threads`                | Thread execution metadata            | `thread_id`                                         |
| `entity_tags`            | Entity-to-tag associations           | `(entity_base_uri, tag_base_uri)`                   |
| `thread_tags`            | Thread-to-tag associations           | `(thread_id, tag_base_uri)`                         |
| `entity_relations`       | Entity-to-entity relationships       | `(source_base_uri, target_base_uri, relation_type)` |
| `entity_embeddings`      | Semantic search vectors (768-dim)    | `(base_uri, chunk_index)`                           |
| `activity_git_daily`     | Daily git activity aggregates        | `date`                                              |
| `activity_heatmap_daily` | Multi-source daily activity          | `date`                                              |
| `index_metadata`         | Schema version and sync state        | `key`                                               |

### Entity Indexing Flow

1. Read markdown file from filesystem
2. Extract YAML frontmatter as entity properties
3. Extract tags array into `entity_tags` junction table
4. Parse relation strings into `entity_relations` table (format: `relation_type [[target_base_uri]] (optional context)`)
5. Upsert entity record with full frontmatter preserved as JSON column

All entity types are stored in a single `entities` table with a `type` column. The `frontmatter` JSON column preserves all type-specific properties for schema-agnostic access.

### Sync Strategies

Three sync modes with automatic fallback:

**Incremental Sync** (preferred, fastest):

- Uses `git diff` to detect changed files since last sync
- Only processes modified entities and threads
- Tracks per-repository HEAD SHA in `index_metadata`

**Resync Full Index** (fallback):

- Scans entire filesystem without dropping tables
- Batch upserts all entities and threads (chunk size: 500)
- Detects and removes orphans (items in DB but not on filesystem)
- Index remains queryable during operation

**Reset and Rebuild** (last resort):

- Drops all tables and recreates schema
- Full repopulation from filesystem
- Backfills git activity data (365 days)
- Index unavailable during operation

### Startup Flow

```

1. Check schema version in index_metadata
   Mismatch -> reset_and_rebuild
   Match -> try incremental sync
   Failure -> try resync
   Failure -> reset_and_rebuild
```

A queue-based lock prevents concurrent sync operations.

### Read-Only Mode

The index supports read-only initialization (`access_mode: 'READ_ONLY'`) for API instances that only need query access. Write operations, schema creation, and startup sync are all skipped.

## Relation Storage

Entity relations are stored in the `entity_relations` table with composite primary key preventing duplicates.

Relations are extracted from entity frontmatter using the wiki-link syntax:

```
relation_type [[target_base_uri]] (optional context)
```

Query patterns:

- **Forward relations**: Find entities this entity points to (outgoing)
- **Reverse relations**: Find entities pointing to this entity (incoming), including threads

## Search Integration

### Structured Queries

Entity and thread tables support filtering by: type, status, priority, tags, archived state, date ranges, and user_public_key. Task-specific fields (deadlines, estimates) are extracted from the frontmatter JSON column.

### Semantic Search

The `entity_embeddings` table stores 768-dimensional float vectors for chunk-level semantic search:

- Content hash tracks staleness for re-embedding decisions
- Cosine similarity search with configurable threshold
- Results ranked by similarity score

## Database Storage Backends

Separate from the embedded index, the database entity system provides configurable storage for user-defined structured data collections.

### Supported Backends

| Backend              | Storage                              | Use Case                                     |
| -------------------- | ------------------------------------ | -------------------------------------------- |
| **DuckDB** (default) | Local `.db` file per database entity | Fast local analytics                         |
| **PostgreSQL**       | External database connection         | Shared/production data                       |
| **TSV**              | Tab-separated text files             | Manual inspection, data exchange             |
| **Markdown**         | Directory of `.md` entity files      | Full entity system integration with git sync |

### Storage Adapter Interface

All backends implement a common interface:

- `initialize()` / `create_table()` -- Setup from database entity schema
- `insert()` / `update()` / `delete()` -- CRUD operations
- `query({ filter, sort, limit, offset })` -- Filtered queries with pagination
- `count()` / `close()` -- Utilities

### Cross-Machine Access

Remote backends are supported via SSH:

- `storage_config.host` specifies SSH config alias
- If host matches current machine, uses local adapter
- If remote, uses SSH-based adapter (`duckdb-remote.mjs`, `tsv-remote.mjs`)
- PostgreSQL uses native connection strings; Markdown uses git sync

### Database Entity Schema

Database entities define their structure via `fields` array with type mappings:

| Field Type   | DuckDB    | PostgreSQL       | Description     |
| ------------ | --------- | ---------------- | --------------- |
| string       | VARCHAR   | TEXT             | Text data       |
| number       | DOUBLE    | DOUBLE PRECISION | Numeric data    |
| boolean      | BOOLEAN   | BOOLEAN          | True/false      |
| datetime     | TIMESTAMP | TIMESTAMPTZ      | Date and time   |
| array/object | JSON      | JSONB            | Structured data |

## Key Modules

| Module                                                                     | Purpose                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `libs-server/embedded-database-index/embedded-index-manager.mjs`           | Singleton manager for init, sync, rebuild, shutdown         |
| `libs-server/embedded-database-index/duckdb/duckdb-schema-definitions.mjs` | Table and index definitions                                 |
| `libs-server/embedded-database-index/duckdb/duckdb-entity-sync.mjs`        | Entity batch upsert and tag/relation sync                   |
| `libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs`      | Entity, thread, and tag statistics queries                  |
| `libs-server/embedded-database-index/duckdb/duckdb-relation-queries.mjs`   | Forward and reverse relation queries                        |
| `libs-server/embedded-database-index/duckdb/duckdb-embedding-queries.mjs`  | Semantic search operations                                  |
| `libs-server/embedded-database-index/entity-data-extractor.mjs`            | Frontmatter extraction and relation parsing                 |
| `libs-server/database/storage-adapters/`                                   | Backend implementations (DuckDB, PostgreSQL, TSV, Markdown) |
| `system/schema/database.md`                                                | Database entity type definition                             |
