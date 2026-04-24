---
title: Search Module
type: text
description: >-
  Source-first search module: orchestrator, five source adapters (entity, thread_metadata,
  thread_timeline, path, semantic), filters, ranker, and deny-by-default permission gate.
base_uri: sys:libs-server/search/ABOUT.md
public_read: false
---

# Search Module

Domain entry: [[user:text/base/search-architecture.md]].

## Purpose

Answer queries over entities and threads with a single orchestrator composing independent source adapters. One HTTP route, one CLI command, one flat response shape, one filter vocabulary.

## Layout

```
search/
  orchestrator.mjs          Entry point; dedupe + pagination + permission gate.
  filters.mjs               type / tag / status / path filter application.
  ranker.mjs                Per-source normalization + weights + recency boost.
  permission.mjs            Deny-by-default wrapper around check_permissions_batch.
  search-config.mjs         Config loader (sources.enabled_by_default, caps, timeouts).
  resolve-search-scope.mjs  Resolve a scope base URI (e.g. `user:`, `user:task/`) to an absolute directory for the path source.
  file-path-cache.mjs       Cache in front of libs-server/files/list-file-paths, keyed by resolved absolute path (null key = whole user-base).
  semantic-search-engine.mjs  Cosine over entity_embeddings; accepts AbortSignal.
  sources/
    entity.mjs              FTS5 over entities_fts, bm25(10, 3, 1).
    thread-metadata.mjs     FTS5 over threads_fts.
    thread-timeline.mjs     FTS5 over thread_timeline_fts (per-turn docs).
    path.mjs                Fuzzy scorer over path cache; accepts a `scope_uri` option that narrows enumeration to a sub-tree.
    semantic.mjs            Wraps semantic-search-engine; forwards signal.
    fts-query.mjs           Tokenize + phrase-quote so FTS operators are literal.
```

Two distinct concepts sit on either side of the ranker: `scope` is a base URI passed to the path source and controls which directory is enumerated, while `path_glob` is a post-source filter matched against each hit's `entity_uri`. The path source is the only adapter that cares about `scope`; filters apply uniformly across sources.

## Contract

All adapters: `async search({query, candidate_limit, signal?})` returning `Array<{entity_uri, raw_score, matched_field, snippet, extras}>`. Orchestrator owns dedupe by `entity_uri`; permission_filter receives the paginated page and drops hits whose `read.allowed !== true`. `total === results.length`.

## Tokenizer

Default `unicode61` (no `tokenchars`). Hyphens become word breaks, so `nano-community` and `nano community` produce identical matches. Source adapters phrase-quote every token so a user-supplied `-` is literal (not the FTS5 NOT operator).

## Related

- [[sys:libs-server/embedded-database-index/ABOUT.md]] — FTS5 schema, triggers.
- [[sys:libs-server/embedded-database-index/sync/ABOUT.md]] — turn extractor, timeline sync.
- [[sys:libs-server/files/ABOUT.md]] — file-path enumeration.
