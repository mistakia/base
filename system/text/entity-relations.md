---
title: Entity Relations
type: text
description: Documentation for standard entity relation types and their usage
tags: [knowledge, relations, documentation]
---

# Entity Relations

## Relation Format

Entity relations in the knowledge base follow a specific format:

```
relation_type [[Target Entity]] (optional context)
```

Relations are defined in the frontmatter of markdown files as an array:

```yaml
relations:
  - 'implements [[System Design]]'
  - 'relates_to [[Other Document]] (provides context)'
  - 'depends_on [[Dependency]]'
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

## Entity-Specific Relation Mappings

Different entity types use specific relation types that map to frontmatter properties:

### Task Relations

- `assigned_to` → `persons`: Assigned persons
- `requires` → `physical_items`/`digital_items`: Required resources
- `child_of` → `parent_tasks`: Parent tasks
- `depends_on` → `dependent_tasks`: Task dependencies
- `executes` → `activities`: Activities executed by the task
- `involves` → `organizations`: Organizations involved

### Physical Item Relations

- `part_of` → `parent_items`: Parent items
- `contains` → `child_items`: Child items

### Person Relations

- `member_of` → `organizations`: Organizations the person belongs to

### Organization Relations

- `has_member` → `members`: Members of the organization

### Activity Relations

- `follows` → `guidelines`: Guidelines followed by the activity

## Relation Storage

Relations are stored in the database in the `entity_relations` table with the following structure:

- `source_entity_id`: The entity that has the relation
- `target_entity_id`: The entity that is the target of the relation
- `relation_type`: The type of relation
- `context`: Optional context for the relation

## Observations

- [design] Standardized relation types create a consistent semantic graph #knowledge-graph
- [implementation] Relations are stored in both frontmatter and database for different use cases #storage
- [feature] Entity-specific relation mappings allow for specialized property access #usability

## Relations

- relates_to [[Knowledge Base Schema]]
- part_of [[System Design]]
- implements [[Knowledge Graph]]
