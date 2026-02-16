---
title: Write Entity
type: guideline
description: Guidelines for creating new entity files that conform to the entity schema
base_uri: sys:system/guideline/write-entity.md
created_at: '2025-05-27T18:10:20.239Z'
entity_id: 544ca576-6602-4332-b02a-18c5e06122e0
globs:
  - '**/*.md'
observations:
  - '[standard] Entity files must follow schema requirements'
public_read: true
relations:
  - implements [[sys:system/schema/entity.md]]
  - related_to [[sys:system/guideline/write-guideline.md]]
  - related_to [[sys:system/text/base-uri.md]]
updated_at: '2026-01-05T19:25:18.593Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:30:59.888Z'
---

## Content Formatting

- Entity content MUST NOT use emojis in any form
- Entity content MUST use Base URI format as specified in sys:system/text/base-uri.md

## Frontmatter Requirements

- Entity files MUST include all required fields from the entity schema:
  - `title`: Clear, identifiable name for the entity
  - `type`: The entity type (must match a defined type in `sys:system/schema/`)
  - `description`: Brief summary of the entity's purpose or contents
- Entity files MUST include any additional required fields specified in their type definition
- Entity files MUST ONLY use properties defined in their respective schema type definitions
- Non-schema properties MUST be included in the body content rather than the frontmatter
- Entity files SHOULD include these fields when applicable:
  - `tags`: Relevant categories and descriptors
  - `relations`: Connections to other system elements using the wikilink format
  - `observations`: Key insights or notes about the entity

## Relations

- Relations MUST be defined in the frontmatter, NOT in the body content
- Relations MUST use the proper base_uri when referencing other entities
- Relations SHOULD use the format: `'relationship_type [[target_entity_path]]'`
- Example:
  ```yaml
  relations:
    - 'implements [[sys:system/schema/entity.md]]'
    - 'depends_on [[user:task/setup-database.md]]'
  ```

## Tags

- Tags MUST be defined in the frontmatter, NOT in the body content
- Tags MUST use the proper base_uri when referencing tag entities
- Tags SHOULD use the format: `'tag_base_uri'`
- Example:
  ```yaml
  tags:
    - 'sys:tag/authentication.md'
    - 'sys:tag/security.md'
    - 'user:tag/project-alpha.md'
  ```

## Entity Creation Tools

### For New Entities

Use the base entity create tool (`mcp__base__entity_create`) for creating new entity files:

- **base_uri**: Required. Must use `user:` prefix for user-created entities (e.g., `user:task/my-task.md`)
- **title**: Required. Clear, identifiable name
- **entity_type**: Required. Must match a defined type in `sys:system/schema/`
- **description**: Optional but recommended
- **entity_content**: The markdown content for the entity body
- **entity_properties**: Additional properties specific to the entity type

### For Existing Entities

Use the Edit tool to modify existing entity files while preserving schema requirements.

### Examples

For a new task entity using the base entity create tool:

```javascript
// Tool call example
mcp__base__entity_create({
  base_uri: 'user:task/implement-login-feature.md',
  title: 'Implement Login Feature',
  entity_type: 'task',
  description: 'Create a secure login system for the application',
  entity_properties: {
    priority: 'High',
    status: 'In Progress',
    assigned_to: 'john-smith',
    finish_by: '2023-08-15',
    tags: [
      'sys:tag/authentication.md',
      'sys:tag/security.md',
      'sys:tag/frontend.md'
    ],
    relations: [
      'implements [[user:text/requirements/user-authentication.md]]',
      'depends_on [[user:task/setup-database.md]]'
    ]
  },
  entity_content: `## Requirements

- Secure password storage using bcrypt
- Email verification process
- OAuth integration with Google and GitHub

## Acceptance Criteria

- Users can register with email/password
- Users can log in with registered credentials
- Users can reset passwords via email`
})
```
