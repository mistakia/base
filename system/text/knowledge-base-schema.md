---
title: 'Knowledge Base Schema'
type: 'text'
description: |
  Documentation for the knowledge base schema architecture and extension mechanisms
created_at: '2025-05-27T18:10:20.245Z'
entity_id: 'e773b4d1-83c1-4fa2-85a8-b22d2d04667a'
observations:
  - '[design] Knowledge base schema is a dual-system architecture'
  - '[implementation] System schema is in system/schema and user schema is in submodules'
  - '[feature] Schema extensions allow for user-specific customization'
relations:
  - 'relates_to [[sys:text/system-design.md]]'
tags:
updated_at: '2025-05-27T18:10:20.245Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Knowledge Base Schema

## System vs User Knowledge Base

The knowledge base architecture consists of two complementary components:

### System Knowledge Base

- Defines the core schema structure and base types
- Located in the `system/` directory of the root repository
- Provides the foundation that user knowledge builds upon

### User Knowledge Base

- Located in submodules (with `user/` as the default submodule name)
- Each submodule belongs to a different user and contains their specific content
- Implements and extends the system schema for user-specific needs
- Can customize and add properties to existing types
- Can define new types that inherit from system types

## Schema Extension

Users can extend the knowledge base schema in several ways:

1. **Custom Properties**: Add new properties to existing types in user-specific items

   ```yaml
   ---
   title: My Task
   type: type_extension
   extends: task

   # Custom user property
   my_custom_field: Custom value
   ---
   ```

2. **Custom Types**: Define new types that extend system types
   ```yaml
   ---
   title: My Custom Type Definition
   type: type_definition
   extends: task
   properties:
     - name: completion_percentage
       type: number
       required: false
     - name: review_cycle
       type: string
       enum: [daily, weekly, monthly]
   ---
   ```

All schema extensions should be stored in the `schema/` directory within the user's submodule to maintain separation from content items. This keeps schema definitions organized and discoverable.

Example path: `user/schema/custom_task_extension.md`

## Content Structure

The body of each markdown file follows this general structure:

```markdown
# Document Title

Body contains any content relevant to the document.
```

## Observations and Relations

Every knowledge item can include observations and relations in the frontmatter to build a rich semantic knowledge graph:

### Observations

Structured facts with semantic categorization in frontmatter:

```yaml
observations:
  - '[category] A brief description of the observation (optional context)'
  - '[tech] Uses PostgreSQL for indexing databases'
  - '[decision] Selected markdown for storage (Based on team discussion)'
```

### Relations

Relations must be defined in the frontmatter as an array of strings following a specific format:

```yaml
relations:
  - 'relates_to [[sys:text/system-design]]'
  - 'implements [[sys:schema/design-pattern]]'
  - 'blocked_by [[sys:schema/database]]'
  - 'assigned_to [[user:schema/person/jane-doe]]'
```

Canonical relation types are centralized in the `entity_relations` namespace in `libs-shared` and include:

- **Association Relations**

  - `relates_to`: General relationship between items
  - `implements`: Implements a pattern, guideline, or design

- **Dependency Relations**

  - `blocked_by`: Entity is blocked by another entity
  - `blocks`: Entity blocks another entity
  - `requires`: Requires a resource or item

- **Sequence Relations**

  - `precedes`: Entity should be completed before another
  - `succeeds`: Entity should be completed after another

- **Hierarchy Relations**

  - `part_of`: Hierarchical relationship (item is part of a larger whole)
  - `contains`: Contains other items
  - `subtask_of`: Task is a subtask of another task
  - `has_subtask`: Task has subtasks

- **Assignment Relations**

  - `assigned_to`: Assignment relationship

- **Membership Relations**

  - `member_of`: Membership relationship
  - `has_member`: Organization-member relationship

- **Resource Relations**

  - `needs_item`: Entity requires a specific item
  - `uses_item`: Entity uses a specific item

- **Involvement Relations**
  - `involves`: Involvement relationship

## Permalinks and Referencing

Each document has a unique permalink that serves as its stable identifier. These permalinks enable consistent referencing even if titles change:

- Auto-generated from the title if not specified
- Can be customized in frontmatter
- The canonical reference for relations is the file path (relative to the knowledge base root) e.g. `[[sys:text/system-design.md]]`.

## File Path Storage

Entity files are stored in the database with two path references:

- `absolute_path`: The full filesystem path to the file (e.g., `/Users/username/Projects/base/system/text/base-threads.md`)
- `base_uri`: A standardized reference path that follows these conventions:
  - For system knowledge base files: `sys:text/base-threads.md`
  - For user knowledge base files: `<knowledge_base_name>:<relative_path>.md` (e.g., `user:guidelines/write-text.md`)

The `base_uri` format is designed to be used for canonical references across the knowledge base and is the format used in wikilinks.

## Available Content Types

The knowledge base supports the following content types. See the actual schema files in `sys:schema/` for detailed property definitions and usage guidance:

- [Base](../schema/base.md) - Core properties shared by all content types
- [Workflow](../schema/workflow.md) - Actions or processes
- [Task](../schema/task.md) - Discrete units of work
- [Guideline](../schema/guideline.md) - Standards, procedures, or best practices
- [Physical Item](../schema/physical_item.md) - Tangible objects or materials
- [Digital Item](../schema/digital_item.md) - Files, software, or digital artifacts
- [Physical Location](../schema/physical_location.md) - Places, addresses, or geographical points
- [Person](../schema/person.md) - Individual people
- [Organization](../schema/organization.md) - Companies, departments, or teams
- [Text](../schema/text.md) - General content or documentation
- [Database](../schema/database.md) - Collections of related database items
- [Database Item](../schema/database_item.md) - Records within a database
- [Database View](../schema/database_view.md) - Saved display configurations for databases
- [Type Definition](../schema/type_definition.md) - Defines structure of content types
- [Type Extension](../schema/type_extension.md) - Adds properties to existing types
- [Prompt](../schema/prompt.md) - Structured input for models, used to guide response generation
