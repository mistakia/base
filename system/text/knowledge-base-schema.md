---
title: Knowledge Base Schema
type: text
description: Documentation for the knowledge base schema architecture and extension mechanisms
base_uri: sys:system/text/knowledge-base-schema.md
created_at: '2025-05-27T18:10:20.245Z'
entity_id: e773b4d1-83c1-4fa2-85a8-b22d2d04667a
observations:
  - '[design] Knowledge base schema is a dual-system architecture'
  - '[implementation] System schema is in system/schema and user schema is in separate repositories'
  - '[feature] Schema extensions allow for user-specific customization'
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
updated_at: '2026-01-05T19:25:18.033Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:36:45.269Z'
---

# Knowledge Base Schema

The knowledge base architecture consists of two complementary components:

### System Knowledge Base

- Defines the core schema structure and base types
- Located in the `system/` directory of the root repository
- Provides the foundation that user knowledge builds upon

### User Knowledge Base

- Each repository belongs to a different user and contains their specific content
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

All schema extensions should be stored in the `schema/` directory within the user's repository to maintain separation from content items. This keeps schema definitions organized and discoverable.

Example path: `user:schema/custom-task-extension.md`

## Content Structure

The body of each markdown file follows this general structure:

```markdown
# Document Title (optional)

Body contains any content relevant to the document.
```

## Observations and Relations

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

Relations must be defined in the frontmatter as an array of strings following a specific format:

```yaml
relations:
  - 'relates_to [[sys:system/text/system-design.md]]'
  - 'implements [[sys:system/schema/design-pattern.md]]'
  - 'blocked_by [[sys:system/schema/database.md]]'
  - 'assigned_to [[user:person/jane-doe.md]]'
```

Canonical relation types are centralized in the `entity_relations` namespace in `libs-shared`. See [[sys:system/text/entity-relations.md]] for the full catalog of relation types organized by category (association, dependency, sequence, hierarchy, assignment, membership, resource, and involvement).

## Available Content Types

The knowledge base supports the following content types. See the actual schema files in `sys:system/schema/` for detailed property definitions and usage guidance:

- [[sys:system/schema/entity.md]] - Core properties shared by all content types
- [[sys:system/schema/workflow.md]] - Defines agentic behavior
- [[sys:system/schema/task.md]] - Describes discrete units of work
- [[sys:system/schema/guideline.md]] - Standards, procedures, or best practices
- [[sys:system/schema/physical_item.md]] - Tangible objects or materials
- [[sys:system/schema/digital_item.md]] - Files (remote files or hyperlinks)
- [[sys:system/schema/physical_location.md]] - Discreet physical space, addresses, or geographical points
- [[sys:system/schema/person.md]] - Individual people
- [[sys:system/schema/organization.md]] - Companies, departments, or teams
- [[sys:system/schema/text.md]] - General content, documentation, or notes
- [[sys:system/schema/tag.md]] - Classification and organization labels
- [[sys:system/schema/identity.md]] - User accounts with authentication keys
- [[sys:system/schema/role.md]] - Reusable permission rule sets
- [[sys:system/schema/scheduled_command.md]] - CLI commands scheduled for automated execution
- [[sys:system/schema/skill.md]] - Agent skills discovered from extensions
- [[sys:system/schema/extension.md]] - Convention-based CLI extensions
- [[sys:system/schema/database.md]] - Defines a structured dataset
- [[sys:system/schema/database_item.md]] - Records within a dataset
- [[sys:system/schema/database_view.md]] - Saved display configurations for datasets
- [[sys:system/schema/type_definition.md]] - Defines structure of content types
- [[sys:system/schema/type_extension.md]] - Adds properties to existing types
- [[sys:system/schema/prompt.md]] - Structured input for models, used to guide response generation
