---
title: 'Entity Relations'
type: 'text'
description: |
  Documentation for standard entity relation types and their usage
created_at: '2025-05-27T18:10:20.243Z'
entity_id: 'd87b4201-ce8b-4596-b323-936f8449a0c8'
observations:
  - '[design] Standardized relation types create a consistent semantic graph'
  - '[implementation] Relations use a single canonical format'
  - '[feature] Entity relationships are handled through a single mechanism'
relations:
  - 'relates_to [[sys:text/knowledge-base-schema.md]]'
  - 'part_of [[sys:text/system-design.md]]'
tags:
updated_at: '2025-05-27T18:10:20.243Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Entity Relations

## Relation Format

Entity relations in the knowledge base follow a specific format:

```
relation_type [[path/to/entity-file]] (optional context)
```

Relations are defined in the frontmatter of markdown files as an array:

```yaml
relations:
  - 'implements [[sys:text/system-design]]'
  - 'relates_to [[sys:text/other-document]] (provides context)'
  - 'blocked_by [[sys:schema/dependency]]'
```

## Standard Relation Types

The following standard relation types are defined in the system and centralized in the `entity_relations` namespace in `libs-shared`. Each relation type is available as a constant (e.g., `RELATION_RELATES_TO`) to ensure consistency across the codebase:

### Association Relations

- `relates_to`: General relationship between items
- `implements`: Implements a pattern, guideline, or design

### Dependency Relations

- `blocked_by`: Entity is blocked by another entity
- `blocks`: Entity blocks another entity
- `requires`: Requires a resource or item

### Sequence Relations

- `precedes`: Entity should be completed before another
- `succeeds`: Entity should be completed after another

### Hierarchy Relations

- `part_of`: Item is part of a larger whole
- `contains`: Item contains other items
- `subtask_of`: Task is a subtask of another task
- `has_subtask`: Task has subtasks

### Assignment Relations

- `assigned_to`: Assignment relationship

### Membership Relations

- `member_of`: Entity is a member of a group/organization
- `has_member`: Organization has a member

### Resource Relations

- `needs_item`: Entity requires a specific item
- `uses_item`: Entity uses a specific item

### Involvement Relations

- `involves`: Indicates involvement with an entity

## Canonical Relation Usage

All entity relationships are managed through the `relations` property in the frontmatter using canonical relation types.

```yaml
relations:
  - 'subtask_of [[user/tasks/parent-task]]'
  - 'blocked_by [[user/tasks/dependent-task]]'
  - 'assigned_to [[user/person/jane-doe]]'
```

## Common Entity Relation Patterns

While any entity can use any relation type, certain patterns are common:

### Task Relations

- `assigned_to`: Assigned persons
- `requires`: Required resources
- `subtask_of`: Parent tasks
- `has_subtask`: Subtasks
- `blocked_by`: Task dependencies
- `blocks`: Tasks blocked by this task
- `precedes`: Tasks that should come before others
- `succeeds`: Tasks that should come after others
- `needs_item`: Physical items needed
- `uses_item`: Tools or resources used
- `involves`: Organizations involved

### Physical Item Relations

- `part_of`: Items this is a component of
- `contains`: Components that make up this item

### Person Relations

- `member_of`: Organizations the person belongs to
- `assigned_to`: Tasks assigned to the person

### Organization Relations

- `has_member`: Members of the organization
- `part_of`: Parent organizations
- `contains`: Sub-organizations

## Relation Storage

Relations are stored in the database in the `entity_relations` table with the following structure:

- `source_entity_id`: The entity that has the relation
- `target_entity_id`: The entity that is the target of the relation
- `relation_type`: The type of relation
- `context`: Optional context for the relation

## Functions

The following functions are available in the `entity-relations` module:

- `get_all_standard_relation_types()`: Returns all standard relation types
