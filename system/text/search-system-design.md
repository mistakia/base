---
title: Search System Design
type: text
description: Architecture and design decisions for the unified search system
base_uri: sys:system/text/search-system-design.md
created_at: '2026-01-14T05:11:24.063Z'
entity_id: 42df8f5c-24e8-4889-a9d9-c474fd84ace6
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/permission-system-design.md]]
  - relates_to [[sys:system/text/database-and-indexing.md]]
  - relates_to [[sys:system/text/background-services.md]]
updated_at: '2026-04-26T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:37:40.256Z'
---

# Search System Design

## Overview

The search system serves the Command Palette and any other client that needs unified, permission-filtered results across entities, threads, and files. It is built around a **source-orchestrator** model: a small set of independent search sources run in parallel against the SQLite index (and a few other backends), and an orchestrator deduplicates, ranks, paginates, and permission-filters the merged results.

There is no single "search mode" toggle. Callers select which sources to run via a `source` parameter; the default set covers the common case.

## Architecture

```
GET /api/search
   |
   v
orchestrator
   |-- entity            (FTS5 over entities_fts)
   |-- thread_metadata   (FTS5 over threads_fts)
   |-- thread_timeline   (FTS5 over thread_timeline_fts)
   |-- path              (file enumeration + native fuzzy scorer)
   |-- semantic          (embedding similarity, optional)
   |-- <external>        (extension-registered adapters)
   |
   v
dedupe -> attach metadata -> filter -> rank -> paginate -> permission filter -> response
```

All sources implement the same interface: given `{ query, candidate_limit, ... }`, return an array of hits `{ entity_uri, raw_score, matched_field, snippet, extras, source }`. This keeps the orchestrator agnostic to backend details and makes new sources cheap to add.

Key files:

- Route: `server/routes/search.mjs`
- Orchestrator: `libs-server/search/orchestrator.mjs`
- Sources: `libs-server/search/sources/{entity,thread-metadata,thread-timeline,path,semantic}.mjs`
- Filters / ranking / permissions: `libs-server/search/{filters,ranker,permission}.mjs`
- Fuzzy scorer: `libs-server/search/fuzzy-scorer.mjs`
- FTS schema: `libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs`
- Entity sync: `libs-server/embedded-database-index/sqlite/sqlite-entity-sync.mjs`

## Sources

### Entity (`sources/entity.mjs`)

Queries the FTS5 virtual table `entities_fts(base_uri UNINDEXED, title, description, attributes, body)` with `MATCH` and ranks by `bm25(entities_fts, 10.0, 3.0, 4.0, 1.0)`. Title hits dominate, description is mid-weighted, attributes (structured frontmatter fields) outrank body, body is the long tail.

The `entities` table extracts a fixed set of fields from frontmatter (title, description, status, priority, archived, public_read, timestamps, user_public_key) into typed columns, plus the markdown body, a derived `attributes` TEXT column (see below), and the full frontmatter JSON in a `frontmatter` TEXT column.

Snippets are produced via FTS5 `snippet()` per field; the source returns whichever snippet actually contains a match (title > description > attributes > body).

#### Attributes

A per-type allowlist of frontmatter fields is concatenated (newline-joined) into the `attributes` column during entity sync, making structured fields searchable. The allowlist is configured in `config/search-config.json` under `entity_index.searchable_attributes`, e.g.:

```json
{
  "entity_index": {
    "searchable_attributes": {
      "physical-item": ["manufacturer", "model_number", "serial_number"]
    }
  }
}
```

Strings pass through; arrays of scalars are joined by spaces; non-strings are skipped. Tokenization follows the default `unicode61` tokenizer, so `"Joule 23F"` produces tokens `joule` and `23f`. A missing type or empty list yields a `null` `attributes` value. Config changes take effect after the search-config module cache resets (process restart) and require an index rebuild to backfill existing rows.

There is no ILIKE fallback. If the SQLite query fails the source returns an empty result set.

The FTS tables are kept in lockstep with their content tables (`entities`, `threads`, `thread_timeline`) by SQLite `AFTER INSERT/UPDATE/DELETE` triggers defined alongside the schema. The sync layer writes only to the content tables; FTS rows follow automatically.

### Thread Metadata (`sources/thread-metadata.mjs`)

FTS5 over `threads_fts(thread_id UNINDEXED, title, short_description)` with `bm25(5.0, 1.0)`. `thread_id` is `UNINDEXED` — searching for a literal thread UUID will not match here.

This replaces the earlier ripgrep-PCRE2 scan over thread metadata files. The rich field list documented previously (`workflow_base_uri`, `working_directory`, `git_branch`) is no longer searched; only `title` and `short_description` are indexed. If thread search needs to span more fields again, extend `threads_fts` and the sync layer.

### Thread Timeline (`sources/thread-timeline.mjs`)

FTS5 over `thread_timeline_fts(turn_text)`, one row per turn in the `thread_timeline` table. Returns one hit per matched turn, carrying `thread_id` and `turn_index` in `extras`. The orchestrator collapses timeline hits into the parent thread URI during dedupe.

### Path (`sources/path.mjs`)

Enumerates file paths (ripgrep `--files`, honoring `.gitignore` and configured exclude patterns), optionally scoped to a `base_uri` prefix, and fuzzy-scores every candidate against the query. See [Fuzzy Scoring](#fuzzy-scoring) below.

Path hits arrive with only `file_path` and a fuzzy score; `type`, `status`, and `title` are filled in later by the orchestrator's batch metadata fetch (or remain null for files that aren't tracked entities). Status and tag filters are skipped for path hits because they don't apply.

Directories are no longer a separate source; if directory results are needed, derive them from path hits. Empty directories cannot be discovered this way.

### Semantic (`sources/semantic.mjs`)

Thin wrapper over the embedding-similarity service. Runs under an `AbortController` with a configurable timeout (default 2000 ms). Any failure mode — timeout, abort, backend unavailable, exception — collapses to an empty result set with no surfaced error. Semantic is treated as best-effort and silent.

### External

Extensions register additional sources via `discover_external_search_sources()` (see `libs-server/search/discover-external-sources.mjs`). They follow the same hit shape and participate in dedupe/ranking like any builtin source. The permission filter recognizes only `user:` and `sys:` URI schemes; hits with any other scheme (e.g. `discord://`) **bypass permission checks entirely** and are returned as-is. External sources are responsible for their own access control.

## Orchestration

For each request the orchestrator:

1. **Dispatches** all selected sources in parallel with a per-source `candidate_limit` (default 100). Timed sources (currently only semantic) receive an `AbortSignal`.
2. **Deduplicates** by `entity_uri`. Multiple matches against the same URI collapse into a single hit whose `matches` array preserves per-source `{ source, raw_score, matched_field, snippet }` so the UI can show why a result appeared.
3. **Attaches metadata** (`type`, `status`, `title`, `updated_at`) by batch-querying SQLite. `IN` clauses are chunked at 900 to stay under SQLite's parameter limit.
4. **Filters** by `type`, `status`, `tag`, `path_glob`. Tag filtering joins through `entity_tags` / `thread_tags`. The path source skips status/tag filters (it has neither).
5. **Ranks** (see below).
6. **Paginates** with `offset` / `limit`.
7. **Permission-filters** the page through the permission system (deny-by-default for `user:`/`sys:` URIs). External-scheme hits pass through.

Pagination happens **before** permission filtering, so a page may return fewer than `limit` results when some are denied. This is a deliberate trade-off: it bounds the permission check to one page worth of URIs and avoids over-fetching for users with broad read access.

## Ranking

The ranker (`libs-server/search/ranker.mjs`) combines three signals:

1. **Per-source min/max normalization** of `raw_score` to `[0, 1]`. Sources with different score scales (BM25 vs. fuzzy vs. cosine similarity) are made comparable.
2. **Source weights**: entity 1.0, thread_metadata 0.9, semantic 0.8, thread_timeline 0.7, path 0.5. When a hit appears in multiple sources, the orchestrator takes the best weighted score per source and sums across sources.
3. **Recency boost**: up to +0.1 with exponential decay over a 365-day half-life, applied from `updated_at`.

Final ordering is by total score descending.

## Fuzzy Scoring

Used by the path source. Native scorer inspired by VS Code's Quick Open.

- Query is split on whitespace; each word is scored independently against the full path. **All words must match** (AND) or the path is rejected.
- Per-word score sums the following bonuses along a greedy left-to-right match (values configurable):
  - Consecutive match bonus
  - Word boundary bonus (start > path-separator > other separator)
  - CamelCase bonus
  - Case-match bonus
- A small per-character path length penalty favors shorter paths.
- The first character is tried at up to its first 10 occurrences, taking the best result.

The scorer replaces the previous external `fzf` dependency.

## API

`GET /api/search` accepts:

| Param | Notes |
| --- | --- |
| `q` | Query string; required unless filters narrow results. Minimum 2 chars. |
| `source` | CSV of source names. Defaults to the configured set (entity, thread_metadata, thread_timeline, path). |
| `type` | CSV of entity types. |
| `tag` | CSV of tag base-URIs. |
| `status` | CSV of statuses. |
| `path_glob` | Glob pattern restricting `entity_uri`. |
| `scope` | Base-URI prefix; only the path source uses it today. |
| `limit` | Default 20, capped at `search.max_limit` (100). |
| `offset` | Non-negative integer. |

Response: `{ query, total, results: Hit[] }`. `total` reflects the post-permission-filter count for the returned page.

CSV parameters reject duplicate occurrences with HTTP 400 to keep semantics unambiguous.

## Command Palette (Client)

Client state lives in `client/core/search/`. The query field accepts inline operators that are parsed into chips and translated into API parameters.

| Operator | Wired | Maps to |
| --- | --- | --- |
| `?` (semantic) | yes | `source=semantic` |
| `source:` | yes | `source` |
| `type:` / `t:` | yes | `type` |
| `tag:` | yes | `tag` |
| `status:` | yes | `status` |
| `path:` | yes | `path_glob` |
| `#` (content) | not yet | — |
| `in:` / `dir:` | not yet | — |
| `-term` (exclude) | not yet | — |

The reducer holds chips as an Immutable List; sagas debounce input by 300 ms before issuing the API call.

## Configuration

`config/search-config.json` controls behavior. Notable keys:

- `search.default_limit`, `search.max_limit`, `search.timeout_ms`
- `sources.enabled_by_default` — sources that run when no explicit `source` is given
- `sources.per_source_candidate_cap` — default `candidate_limit` per source (100)
- `sources.semantic_timeout_ms`
- `entity_index.searchable_attributes` — per-entity-type frontmatter field allowlist for the `attributes` FTS column
- Path source ripgrep excludes (e.g. `node_modules`, `.git`, `.system`)

## Trade-offs

| Decision | Trade-off |
| --- | --- |
| FTS5 BM25 for entities | Fast and ranks well on title/description/attributes/body; per-type frontmatter allowlist controls which structured fields are indexed. |
| Source-orchestrator model | Adds normalization complexity vs. one query plan; pays back in pluggability and per-source tuning. |
| Per-source min/max normalization | Comparable scores across heterogeneous backends; loses absolute score meaning. |
| Source weights + recency boost | Tunable relevance; opaque to users. |
| Pagination before permission filter | Bounds permission checks to one page; pages may under-fill when denials occur. |
| Semantic as best-effort | Search degrades gracefully when embeddings are unavailable; results are non-deterministic across deploys. |
| Native fuzzy scorer | No external dependency; ranking quality is "good enough" rather than identical to fzf. |
| Empty directories not discoverable | Path source only sees what ripgrep returns. |

## Performance

Sub-second response is the target for typical queries. The dominant cost varies by source: ripgrep enumeration for path, BM25 over the FTS index for entity/thread, network round-trip for semantic. Per-source candidate caps (100 by default) keep ranking work bounded; final pagination caps response size at 100.

## Known Gaps

- Operators `#`, `in:`, and `-term` are documented in the UI but not yet wired through the API.
- Thread metadata search no longer covers `workflow_base_uri`, `working_directory`, or `git_branch`. If those become important again, add them to `threads_fts` and the sync layer.
