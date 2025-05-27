---
title: 'Create Guideline'
type: 'guideline'
description: |
  Guidelines for creating new guidelines
activities:
  - 'Create Guideline'
created_at: '2025-05-27T18:10:20.239Z'
entity_id: '55c0f40b-3c54-44f9-8366-8c0d91d72986'
globs:
  - 'system/guideline/*.md'
  - 'user/guideline/*.md'
guideline_status: 'Approved'
observations:
  - '[governance] Clear naming conventions improve discoverability #naming'
  - '[standard] RFC 2119 language clarifies requirement levels #clarity'
relations:
  - 'related_to [[system/guideline/write-activity.md]]'
  - 'implements [[system/text/system-design.md]]'
  - 'implements [[system/schema/guideline.md]]'
tags:
updated_at: '2025-05-27T18:10:20.239Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Create Guideline

## Guidelines

### File Structure and Naming

- Guidelines MUST be stored in the appropriate location:
  - System guidelines MUST be stored in `system/guideline/`
  - User guidelines MUST be stored in `user/guideline/`
- Guidelines MUST be named following action-based patterns:
  - For specific activities, use the format: `verb-object.md` (e.g., `write-guideline.md`, `write-unit-tests.md`)
  - For categories of activities, use the format: `category-descriptor.md` (e.g., `code-review-standards.md`, `documentation-practices.md`)
  - Names MUST be in kebab-case format
  - Names MUST be specific and descriptive of the guideline's purpose
  - Names SHOULD be concise while maintaining clarity
- Examples of good naming:
  - `write-guideline.md` (for specific activity of creating guidelines)
  - `write-software-tests.md` (for specific activity of writing tests)
  - `api-design-standards.md` (for category of API design activities)
  - `database-management.md` (for category of database operations)

### Frontmatter Requirements

- Guidelines MUST follow the schema defined in `system/schema/guideline.md`
- Guidelines MUST include complete frontmatter with these fields:
  - `title`: Clear, specific, and descriptive title
  - `type`: Always set to "guideline"
  - `description`: Brief summary of the guideline's purpose
  - `guideline_status`: Current status (Draft, Approved, Deprecated)
  - `tags`: Relevant categories and topics
- Guidelines SHOULD include these additional fields when applicable:
  - `globs`: File patterns this guideline applies to
  - `activities`: Related activities this guideline supports
  - `observations`: Key insights or principles behind the guideline
  - `relations`: Connections to other system elements using the wikilink format with relationship type:
    - Format: `'relationship_type [[target_element]]'` (e.g., `'implements [[system/schema/guideline]]'`)
    - Common relationship types: `implements`, `related_to`, `depends_on`, `extends`, `supersedes`
    - Common targets: guidelines, activities, schemas, design documents
    - Examples:

```yaml
relations:
  - 'implements [[system/schema/guideline]]'
  - 'related_to [[system/guideline/write-activity]]'
  - 'supersedes [[system/guideline/old-guideline]]'
```

### Content Requirements

- Guidelines MUST use RFC 2119 language (MUST, SHOULD, MAY, etc.) to clearly indicate requirement levels
- Guidelines SHOULD have a clear, hierarchical structure with headings
- Each rule SHOULD include a brief explanation of its rationale
- Guidelines SHOULD include examples where appropriate
