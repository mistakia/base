---
title: 'Write Entity'
type: 'guideline'
description: |
  Guidelines for creating new entity files that conform to the base schema
created_at: '2025-05-27T18:10:20.239Z'
entity_id: '544ca576-6602-4332-b02a-18c5e06122e0'
globs:
  - '**/*.md'
observations:
  - '[standard] Entity files must follow schema requirements'
relations:
  - 'implements [[sys:system/schema/base.md]]'
  - 'related_to [[sys:system/guideline/write-guideline.md]]'
  - 'related_to [[sys:system/text/base-uri.md]]'
tags:
updated_at: '2025-05-27T18:10:20.239Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Write Entity

## Frontmatter Requirements

- Entity files MUST include all required fields from the base schema:
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
    - 'implements [[sys:system/schema/base.md]]'
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

### Examples

For a new task entity:

```markdown
---
title: Implement Login Feature
type: task
description: Create a secure login system for the application
priority: High
status: In Progress
assigned_to: john-smith
finish_by: 2023-08-15
tags:
  - 'sys:tag/authentication.md'
  - 'sys:tag/security.md'
  - 'sys:tag/frontend.md'
relations:
  - 'implements [[user:text/requirements/user-authentication.md]]'
  - 'depends_on [[user:task/setup-database.md]]'
---

# Implement Login Feature

## Requirements

- Secure password storage using bcrypt
- Email verification process
- OAuth integration with Google and GitHub

## Acceptance Criteria

- Users can register with email/password
- Users can log in with registered credentials
- Users can reset passwords via email
```
