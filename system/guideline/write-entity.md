---
title: Write Entity
type: guideline
description: Guidelines for creating new entity files that conform to the base schema
globs: [system/**/*.md, user/**/*.md]
guideline_status: Approved
activities: []
tags: []
observations:
  - '[standard] Entity files must follow schema requirements'
relations:
  - 'implements [[system/schema/base.md]]'
  - 'related_to [[system/guideline/write-guideline.md]]'
---

# Write Entity

## Frontmatter Requirements

- Entity files MUST include all required fields from the base schema:
  - `title`: Clear, identifiable name for the entity
  - `type`: The entity type (must match a defined type in `system/schema/`)
  - `description`: Brief summary of the entity's purpose or contents
- Entity files MUST include any additional required fields specified in their type definition
- Entity files SHOULD include these fields when applicable:
  - `tags`: Relevant categories and descriptors
  - `relations`: Connections to other system elements using the wikilink format
  - `observations`: Key insights or notes about the entity

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
tags: [authentication, security, frontend]
relations:
  - 'implements [[user/text/requirements/user-authentication.md]]'
  - 'depends_on [[user/task/setup-database.md]]'
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
