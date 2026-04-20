---
title: Reference Preservation Guideline
type: guideline
description: >-
  RFC-2119 conventions for preserving entity references across moves, keeping the aliases field
  machine-owned, and resolving dangling links before commit.
base_uri: sys:system/guideline/reference-preservation.md
created_at: '2026-04-20T05:31:11.433Z'
entity_id: df54cc7f-e07b-4cf2-8529-1c196e4ed488
globs:
  - '**/*.md'
public_read: false
relations:
  - follows [[sys:system/text/reference-system.md]]
  - implements [[sys:system/schema/guideline.md]]
tags:
  - user:tag/base-project.md
updated_at: '2026-04-20T05:31:11.433Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Reference Preservation Guideline

This guideline governs how contributors and agents handle entity references, moves, and the alias machinery. Terminology follows RFC 2119.

## Moves

- Contributors MUST use `base entity move` to rename or relocate any entity file. Manual `mv` (or IDE rename) bypasses reference rewrites, thread-metadata updates, and the alias write, and SHOULD be treated as data loss.
- Agents SHOULD verify that a planned move will not break references they cannot observe (e.g., external repos) before executing it.

## Aliases

- The `aliases` frontmatter array MUST NOT be written, edited, reordered, or removed by hand. It is machine-owned by `base entity move`.
- Observers MAY read `aliases` to understand an entity's move history. Tools that need alias data SHOULD consult the `entity_aliases` table in `embedded-index.db` rather than parsing frontmatter.

## Dangling references

- Before committing changes that affect entity structure, contributors SHOULD run `base entity validate-references` and resolve any dangling rows it reports.
- Dangling references SHOULD be fixed by moving the referenced entity (so the alias forwards automatically), correcting the link, or removing the stale reference — not by deleting the alias row.

## Wikilinks

- Inline wikilinks in entity body content MUST use the canonical `[[scheme:path]]` form so they are indexed as content wikilinks.
- Frontmatter relations MUST follow the `"relation_type [[base_uri]] (optional context)"` string form (see [[sys:system/guideline/write-entity-relations.md]]); they are not extracted by the content-wikilink extractor and are not duplicated in `entity_content_wikilinks`.

See [[sys:system/text/reference-system.md]] for the full model.
