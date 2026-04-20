---
title: Reference and Alias System
type: text
description: >-
  Authoritative entry document for how path-based references work in the knowledge base: wikilink
  format, resolution order, move semantics, aliases, and the index model.
base_uri: sys:system/text/reference-system.md
created_at: '2026-04-20T05:30:57.672Z'
entity_id: e11f00fa-0504-496f-a620-d67a85ddb4c8
public_read: false
relations:
  - describes [[sys:system/schema/entity.md]]
tags:
  - user:tag/base-project.md
updated_at: '2026-04-20T05:30:57.672Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Reference and Alias System

This document is the single entry point for understanding how references between entities resolve in the knowledge base. It covers the three reference surfaces (frontmatter relations and tags, inline content wikilinks, thread-metadata references), the resolution order with alias fallback, the move semantics that preserve references across file relocations, and the index model that backs validation and back-reference queries.

## Reference surfaces

- **Frontmatter relations** — typed edges declared in an entity's `relations` array. Canonical string format: `"relation_type [[base_uri]] (optional context)"`. Indexed in the `entity_relations` table.
- **Frontmatter tags** — each entry is a tag `base_uri`. Every tag entry is expected to resolve to a `tag/` entity file. Indexed in the `entity_tags` table.
- **Inline content wikilinks** — `[[scheme:path]]` appearing in entity body markdown (outside frontmatter and outside code blocks). Extracted by `libs-server/entity/format/extractors/reference-extractor.mjs` and indexed in the `entity_content_wikilinks` table.
- **Thread-metadata references** — `metadata.relations` and `metadata.file_references` arrays inside a thread's `metadata.json`. Indexed in the `thread_references` table with a `location` discriminator.

## Resolution order

Path-based lookup is registry-driven and synchronous: `libs-server/base-uri/base-uri-utilities.mjs` maps `scheme:path` to an absolute filesystem path. This utility is pure and does not touch the database.

Callers that start from a `base_uri` (rendered wikilinks, route handlers, database-entity lookups) use the async helper `libs-server/entity/filesystem/resolve-entity-by-base-uri.mjs`, which implements the resolution order:

1. `resolve_base_uri(base_uri)` and attempt to read the primary file.
2. On miss: query `entity_aliases` for a matching `alias_base_uri`; if found, resolve the `current_base_uri` and read from there.
3. Otherwise: not found.

The helper returns a `resolved_via` discriminator (`primary | alias`) alongside the normal read result.

## Move semantics

`base entity move` (`libs-server/entity/filesystem/move-entity-filesystem.mjs`) wraps the rename, reference updates, and alias write inside a single `with_transaction()` so a failure rolls back all changes. Within the transaction:

1. Rewrite relations, tags, and inline wikilinks in every other entity that references the source URI.
2. Rewrite `metadata.relations` entries in every thread's `metadata.json`.
3. Append the source `base_uri` to the moved entity's `aliases` array (only the immediate previous URI is appended; historical aliases carry forward through the normal frontmatter round-trip).
4. Write the entity at the destination path and remove the source.

Manual `mv` bypasses all of this and leaves references dangling. Use `base entity move` for every rename.

## Alias lifecycle

The `aliases` frontmatter field is the canonical source of truth for move history. It is git-visible, grepable, and written exclusively by `base entity move`. The `entity_aliases` table in `embedded-index.db` is a derived projection kept coherent by the entity sync pipeline:

- On every entity sync, all `entity_aliases` rows matching the entity's `entity_id` have their `current_base_uri` updated to the entity's current `base_uri` (covers multi-hop A → B → C; the original `A → B` row becomes `A → C`).
- Aliases that no longer appear in the frontmatter are pruned.
- When an entity is deleted, any row whose `current_base_uri` matches the deleted entity's `base_uri` is removed so orphaned aliases do not resolve to a missing entity.

Alias bloat (long `aliases` arrays after many renames) is acceptable; pruning is a future concern.

## Index model

`embedded-index.db` (SQLite) holds the derived projections used by back-reference queries and the validate command. The reference-related tables are:

- `entity_relations(source_base_uri, target_base_uri, relation_type, context)` — frontmatter relations.
- `entity_tags(entity_base_uri, tag_base_uri)` — frontmatter tags.
- `entity_content_wikilinks(source_base_uri, target_base_uri)` — body-content wikilinks only; frontmatter relations and tags are never duplicated here.
- `thread_references(thread_id, target_base_uri, location)` — where `location` is `metadata.relations` or `metadata.file_references`.
- `entity_aliases(alias_base_uri, current_base_uri, entity_id, recorded_at)` — alias projection driving the fallback path.

## Operator commands

- `base entity references <base_uri>` — UNION of inbound rows across the four source tables plus alias entries, grouped by `relation | tag | content-wikilink | thread-metadata | alias`. Supports `--json`.
- `base entity validate-references` — left-join every link source against the UNION of `entities.base_uri` and `entity_aliases.alias_base_uri`; dangling rows are printed grouped by source and the command exits non-zero on any finding.

## Related

- `[[sys:system/schema/entity.md]]` — the `aliases` property definition.
- `[[sys:system/guideline/reference-preservation.md]]` — RFC-2119 conventions for working with references and moves.
