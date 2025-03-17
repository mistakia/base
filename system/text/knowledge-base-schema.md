---
title: Knowledge Base Schema
type: text
description: Documentation for the knowledge base schema architecture and extension mechanisms
tags: [knowledge, schema, documentation]
---

# Knowledge Base Schema

## System vs User Knowledge Base

The knowledge base architecture consists of two complementary components:

### System Knowledge Base

- Defines the core schema structure and base types
- Located in the `system/` directory
- Provides the foundation that user knowledge builds upon

### User Knowledge Base

- Located in the `data/` directory
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

All schema extensions should be stored in the `data/schema/` directory to maintain separation from content items. This keeps schema definitions organized and discoverable.

Example path: `data/schema/custom_task_extension.md`

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

## Observations and Relations

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

## Permalinks and Referencing

Each document has a unique permalink that serves as its stable identifier. These permalinks enable consistent referencing even if titles change:

- Auto-generated from the title if not specified
- Can be customized in frontmatter
- Used in memory:// URLs for direct references

Example reference using memory:// URLs:

```
memory://project/requirements-doc
memory://Person Name
memory://docs/format
```

## Available Content Types

The knowledge base supports the following content types. See the actual schema files in `system/schema/` for detailed property definitions and usage guidance:

- [Base](../schema/base.md) - Core properties shared by all content types
- [Activity](../schema/activity.md) - Actions or processes
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

## Observations

- [architecture] Dual knowledge base system separates core schema from user extensions #design
- [format] Markdown with YAML frontmatter provides a balance of structure and readability #implementation
- [feature] Semantic observations and relations create a rich knowledge graph #connectivity

## Relations

- implements [[Knowledge Format]]
- relates_to [[System Design]]
- part_of [[Documentation]]
