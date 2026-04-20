---
title: Entity Schema
type: type_definition
description: The entity schema that all other types inherit from - a thing that is independent and distinct
base_uri: sys:system/schema/entity.md
created_at: '2025-08-16T17:56:08.203Z'
entity_id: 570cd4c2-cd4d-4a9e-acb6-6e6855b50db5
observations:
  - '[pattern] Added optional aliases array for move-preservation; written by base entity move only.'
properties:
  - name: entity_id
    type: string
    format: uuid
    required: true
    description: Unique identifier used for references
  - name: title
    type: string
    required: true
    description: Human readable title for identification
  - name: type
    type: string
    required: true
    description: One of the predefined content types
  - name: permalink
    type: string
    required: false
    description: Custom URL path (auto-generated if omitted)
  - name: description
    type: string
    required: false
    description: Short description of the content
  - name: user_public_key
    type: string
    required: true
    description: Owning user public key (hex)
  - name: tags
    type: array
    items:
      type: string
    required: false
    description: Array of categorization tags
  - name: relations
    type: array
    items:
      type: string
    required: false
    description: >-
      Array of relations to other entities in format "relation_type [[path/to/entity-file]]
      (optional context)"
  - name: observations
    type: array
    items:
      type: string
    required: false
    description: Array of structured observations in format "[category] Observation text
  - name: created_at
    type: datetime
    required: true
    auto_generated: true
    description: Creation timestamp
  - name: updated_at
    type: datetime
    required: true
    auto_generated: true
    description: Last modified timestamp
  - name: public_read
    type: boolean
    required: false
    description: Whether this entity is publicly readable by unauthenticated users
  - name: visibility_analyzed_at
    type: datetime
    required: false
    description: Timestamp of last content review scan for visibility classification
  - name: archived_at
    type: datetime
    required: false
    description: Date when the item was archived
  - name: aliases
    type: array
    items:
      type: string
    required: false
    description: >-
      Former base_uris of this entity, preserved when the file is moved. Written only by `base
      entity move` (never by hand) so path-based references to old locations continue to resolve via
      the alias index.
relations:
  - relates [[sys:system/guideline/reference-preservation.md]]
type_name: entity
updated_at: '2026-04-20T05:31:26.905Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Entity Schema

This schema defines the core properties that all knowledge base items share. Every content type in the system inherits these properties.

## Content Structure

The body of each markdown file follows this general structure:

```markdown
# Document Title

Body contains any content relevant to the document.
```

## Semantic Knowledge Graph

Every knowledge item can include observations and relations in the frontmatter to build a rich semantic knowledge graph:

### Observations

Structured facts with semantic categorization in frontmatter. See [[sys:system/guideline/write-observations.md]] for standards on when to observe vs edit body content, format, and consolidation.

```yaml
observations:
  - '[category] A brief description of the observation (optional context)'
  - '[tech] Uses SQLite for SQL indexing and queries'
  - '[decision] Selected markdown for storage (Based on team discussion)'
```

### Relations

Connections to other knowledge items in frontmatter. Each relation MUST be a plain string -- never a YAML object. The system rejects object-format relations (e.g., `{type: relates, target: ...}` or `{predicate: ..., target_uri: ...}`).

Required format: `"relation_type [[base_uri]] (optional context)"`

```yaml
relations:
  - 'relates_to [[sys:system/text/system-design]]'
  - 'implements [[sys:system/schema/base]]'
  - 'depends_on [[sys:system/schema/database]]'
  - 'assigned_to [[user:schema/person/jane-doe]]'
```

## Aliases

Optional array of former `base_uri` values for an entity. The list is written exclusively by `base entity move`: each move appends the immediate previous `base_uri`, producing a git-visible forwarding trail across any number of renames or relocations. Entries MUST NOT be added or edited by hand.

```yaml
aliases:
  - 'user:task/old-location.md'
  - 'user:task/intermediate-location.md'
```

The aliases field is the canonical source of truth for move history; the `entity_aliases` table in `embedded-index.db` is a derived projection that drives alias-based reference resolution.
