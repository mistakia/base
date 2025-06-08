---
title: 'Create Guideline'
type: 'guideline'
description: |
  Guidelines for creating new guidelines
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
  - 'related_to [[sys:guideline/write-workflow.md]]'
  - 'implements [[sys:text/system-design.md]]'
  - 'implements [[sys:schema/guideline.md]]'
tags:
updated_at: '2025-05-27T18:10:20.239Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Create Guideline

## Guidelines

### File Structure and Naming

- Guidelines MUST be stored in the appropriate location:
  - System guidelines MUST be stored in `sys:guideline/`
  - User guidelines MUST be stored in `user:guideline/`
- Guidelines MUST be named following action-based patterns:
  - For specific workflows, use the format: `verb-object.md` (e.g., `write-guideline.md`, `write-unit-tests.md`)
  - For categories of workflows, use the format: `category-descriptor.md` (e.g., `code-review-standards.md`, `documentation-practices.md`)
  - Names MUST be in kebab-case format
  - Names MUST be specific and descriptive of the guideline's purpose
  - Names SHOULD be concise while maintaining clarity
- Examples of good naming:
  - `write-guideline.md` (for specific workflow of creating guidelines)
  - `write-software-tests.md` (for specific workflow of writing tests)
  - `api-design-standards.md` (for category of API design workflows)
  - `database-management.md` (for category of database operations)

### Frontmatter

- Guidelines MUST follow the schema defined in `sys:schema/guideline.md`
- Guidelines MUST include complete frontmatter with these fields:
  - `title`: Clear, specific, and descriptive title
  - `type`: Always set to "guideline"
  - `description`: Brief summary of the guideline's purpose
  - `guideline_status`: Current status (Draft, Approved, Deprecated)
  - `tags`: Relevant categories and topics
- Guidelines SHOULD include these additional fields when applicable:
  - `globs`: File patterns this guideline applies to
  - `workflows`: Related workflows this guideline supports
  - `observations`: Key insights or principles behind the guideline
  - `relations`: Connections to other system elements using the wikilink format with relationship type:
    - Format: `'relationship_type [[target_element_base_uri]]'` (e.g., `'implements [[sys:schema/guideline.md]]'`)
    - Common relationship types: `implements`, `related_to`, `depends_on`, `extends`, `supersedes`
    - Common targets: guidelines, workflows, schemas, design documents
    - Examples:

```yaml
relations:
  - 'implements [[sys:schema/guideline.md]]'
  - 'related_to [[sys:guideline/write-workflow.md]]'
  - 'supersedes [[sys:guideline/old-guideline.md]]'
```

### Content

- Guidelines MUST use RFC 2119 language (MUST, SHOULD, MAY, etc.) to clearly indicate requirement levels
- Each rule SHOULD be clear, concise, and easy to understand so that the rationale is self-evident. The rationale should be explicitly stated if it is not self-evident.
- Guidelines SHOULD include examples if it helps to clarify the guideline.
