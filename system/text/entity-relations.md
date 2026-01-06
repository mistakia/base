---
title: Entity Relations
type: text
description: Documentation for standard entity relation types and their usage
base_uri: user:repository/active/base/system/text/entity-relations.md
created_at: '2025-05-27T18:10:20.243Z'
entity_id: d87b4201-ce8b-4596-b323-936f8449a0c8
observations:
  - '[design] Standardized relation types create a consistent semantic graph'
  - '[implementation] Relations use a single canonical format'
  - '[feature] Entity relationships are handled through a single mechanism'
relations:
  - relates_to [[sys:system/text/knowledge-base-schema.md]]
  - part_of [[sys:system/text/system-design.md]]
updated_at: '2026-01-05T19:25:18.887Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
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
  - 'implements [[sys:system/text/system-design.md]]'
  - 'relates_to [[sys:system/text/other-document.md]] (provides context)'
  - 'blocked_by [[sys:system/schema/dependency.md]]'
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
  - 'subtask_of [[user:task/parent-task.md]]'
  - 'blocked_by [[user:task/dependent-task.md]]'
  - 'assigned_to [[user:person/jane-doe.md]]'
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

Relations are stored in entity frontmatter using the `relations` array.

## Thread Relations

Threads are automatically analyzed to extract entity relations from their timeline. This creates a connection between threads and the entities they interact with.

### Thread-as-Entity Model

Threads are treated as entities in KuzuDB with:

- `base_uri`: `user:thread/<thread-id>`
- `type`: `thread`

### Thread Relation Types

Thread relations are extracted from tool calls and message content:

- `accesses`: Thread read an entity (Read tool)
- `modifies`: Thread modified an entity (Edit/Write tool)
- `creates`: Thread created an entity (mcp_base_entity_create)
- `relates_to`: Thread referenced an entity (wikilink in message)

### File and Directory References

In addition to entity relations, threads track file and directory references as pseudo-entities:

- File `base_uri`: `file:<absolute-path>` (e.g., `file:/path/to/code.js`)
- File `type`: `file`
- Directory `base_uri`: `dir:<absolute-path>` (e.g., `dir:/path/to/src/`)
- Directory `type`: `directory`

File references are stored in thread metadata:

```json
{
  "file_references": ["/path/to/file.js", "/path/to/other.ts"],
  "directory_references": ["/path/to/src"]
}
```

### Relation Analysis

Thread relations are analyzed:

- On session end (via sync-claude-session.sh hook)
- On session updates (when existing threads are modified)
- Via batch processing (cli/backfill-thread-relations.mjs)

The analysis timestamp is stored in `relations_analyzed_at` in thread metadata.

## Querying Relations

### Forward Relations

Forward relations query what entities a source entity points to:

```
GET /api/entities/relations?base_uri=user:thread/abc-123&direction=forward
```

### Reverse Relations

Reverse relations query what entities point to a target entity:

```
GET /api/entities/relations?base_uri=user:task/my-task.md&direction=reverse
```

This is useful for finding all threads that accessed or modified a particular entity.

### Query Parameters

- `base_uri`: The entity to query relations for (required)
- `direction`: `forward`, `reverse`, or `both` (default: `both`)
- `relation_type`: Filter by relation type (e.g., `modifies`)
- `entity_type`: Filter by target entity type (e.g., `thread`, `task`, `file`)
- `limit`: Max results per direction (default: 50)
- `offset`: Pagination offset

## KuzuDB Integration

Relations are stored in KuzuDB as graph edges:

- `Entity` nodes represent entities (tasks, threads, files, etc.)
- `RELATES_TO` edges connect entities with relation type and context
- `Tag` nodes and `HAS_TAG` edges represent entity tags

This enables graph traversal queries like finding all threads that modified a specific task, or all entities accessed by threads in a particular working directory.

## Functions

The following functions are available in the `entity-relations` module:

- `get_all_standard_relation_types()`: Returns all standard relation types
