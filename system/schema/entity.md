---
type: type_definition
title: Entity Schema
description: The entity schema that all other types inherit from - a thing that is independent and distinct
created_at: '2025-08-16T17:56:08.203Z'
entity_id: 570cd4c2-cd4d-4a9e-acb6-6e6855b50db5
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
  - name: archived_at
    type: datetime
    required: false
    description: Date when the item was archived
type_name: entity
updated_at: '2025-08-16T17:56:09.131Z'
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

Structured facts with semantic categorization in frontmatter:

```yaml
observations:
  - '[category] A brief description of the observation (optional context)'
  - '[tech] Uses DuckDB for SQL indexing and queries'
  - '[decision] Selected markdown for storage (Based on team discussion)'
```

### Relations

Connections to other knowledge items in frontmatter:

```yaml
relations:
  - 'relates_to [[sys:system/text/system-design]]'
  - 'implements [[sys:system/schema/base]]'
  - 'depends_on [[sys:system/schema/database]]'
  - 'assigned_to [[user:schema/person/jane-doe]]'
```
