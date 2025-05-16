---
title: Entity Relations
type: text
description: Documentation for standard entity relation types and their usage
tags: [knowledge, relations, documentation]
observations:
  - '[design] Standardized relation types create a consistent semantic graph #knowledge-graph'
  - '[implementation] Relations use a single canonical format #consistency'
  - '[feature] Entity relationships are handled through a single mechanism #simplification'
relations:
  - 'relates_to [[system/text/knowledge-base-schema]]'
  - 'part_of [[system/text/system-design]]'
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
  - 'implements [[system/text/system-design]]'
  - 'relates_to [[system/text/other-document]] (provides context)'
  - 'depends_on [[system/schema/dependency]]'
```

## Standard Relation Types

The following standard relation types are defined in the system and centralized in the `entity_relations` namespace in `libs-shared`. Each relation type is available as a constant (e.g., `RELATION_RELATES_TO`) to ensure consistency across the codebase:

### Association Relations

- `relates_to`: General relationship between items
- `implements`: Implements a pattern, guideline, or design

### Dependency Relations

- `depends_on`: Dependency relationship
- `requires`: Requires a resource or item

### Hierarchy Relations

- `part_of`: Item is part of a larger whole
- `contains`: Item contains other items
- `child_of`: Parent-child relationship

### Assignment Relations

- `assigned_to`: Assignment relationship

### Membership Relations

- `member_of`: Entity is a member of a group/organization
- `has_member`: Organization has a member

### Workflow Relations

- `follows`: Follows a guideline or process
- `executes`: Executes an activity or process

### Involvement Relations

- `involves`: Indicates involvement with an entity

## Canonical Relation Usage

All entity relationships are managed through the `relations` property in the frontmatter using canonical relation types.

```yaml
relations:
  - 'child_of [[user/tasks/parent-task]]'
  - 'depends_on [[user/tasks/dependent-task]]'
  - 'assigned_to [[user/person/jane-doe]]'
```

## Common Entity Relation Patterns

While any entity can use any relation type, certain patterns are common:

### Task Relations

- `assigned_to`: Assigned persons
- `requires`: Required resources
- `child_of`: Parent tasks
- `depends_on`: Task dependencies
- `executes`: Activities executed by the task
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

### Activity Relations

- `follows`: Guidelines followed by the activity

## Relation Storage

Relations are stored in the database in the `entity_relations` table with the following structure:

- `source_entity_id`: The entity that has the relation
- `target_entity_id`: The entity that is the target of the relation
- `relation_type`: The type of relation
- `context`: Optional context for the relation

## Functions

The following functions are available in the `entity-relations` module:

- `get_canonical_relation_type(relation_type)`: Normalizes a relation type to its canonical form
- `get_all_standard_relation_types()`: Returns all standard relation types
