---
title: Base Schema
type: type_definition
description: The base schema that all other types inherit from
properties:
  - name: title
    type: string
    required: true
    description: Unique identifier used for references
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
    required: true
    description: Short description of the content
  - name: tags
    type: array
    items:
      type: string
    required: false
    description: Array of categorization tags
  - name: created_at
    type: date
    required: true
    auto_generated: true
    description: Creation timestamp
  - name: updated_at
    type: date
    required: true
    auto_generated: true
    description: Last modified timestamp
  - name: archived_at
    type: date
    required: false
    description: Date when the item was archived
---

# Base Schema

This schema defines the core properties that all knowledge base items share. Every content type in the system inherits these properties.

## Content Structure

The body of each markdown file follows this general structure:

```markdown
# Document Title

Body contains any content relevant to the document.

## Observations

- [category] Fact or observation about the topic #tag1 (optional context)
- [tech] Uses PostgreSQL for indexing #database #search
- [decision] Selected markdown format for portability #storage (Based on user requirements)

## Relations

- relates_to [[Other Document]] (optional context)
- implements [[Design Pattern]]
- depends_on [[Database Schema]]
```

## Semantic Knowledge Graph

Every knowledge item can include observations and relations to build a rich semantic knowledge graph:

### Observations

Structured facts with semantic categorization:

```markdown
## Observations

- [category] Content with #tags (optional context)
- [tech] Uses PostgreSQL for indexing #database
- [decision] Selected markdown for storage #format (Based on team discussion)
```

### Relations

Connections to other knowledge items:

```markdown
## Relations

- relation_type [[Other Document]] (optional context)
- implements [[Design Pattern]]
- depends_on [[Database Schema]]
- assigned_to [[Person Name]]
```
