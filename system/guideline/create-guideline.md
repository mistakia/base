---
title: Create Guideline
type: guideline
description: Guidelines for creating new guidelines
globs: [system/guideline/*.md, data/guideline/*.md]
guideline_status: Approved
activities: [Create Guideline]
tags: [guideline, creation, governance]
observations:
  - '[governance] Clear naming conventions improve discoverability #naming'
  - '[standard] RFC 2119 language clarifies requirement levels #clarity'
relations:
  - 'related_to [[system/guidelines/create-activity]]'
  - 'implements [[system/text/system-design]]'
  - 'implements [[system/schema/guideline]]'
---

# Create Guideline

## Guidelines

### File Structure and Naming

- Guidelines MUST be stored in the appropriate location:
  - System guidelines MUST be stored in `system/guideline/`
  - User guidelines MUST be stored in `data/guideline/`
- Guidelines MUST be named following action-based patterns:
  - For specific activities, use the format: `verb-object.md` (e.g., `create-guideline.md`, `write-unit-tests.md`)
  - For categories of activities, use the format: `category-descriptor.md` (e.g., `code-review-standards.md`, `documentation-practices.md`)
  - Names MUST be in kebab-case format
  - Names MUST be specific and descriptive of the guideline's purpose
  - Names SHOULD be concise while maintaining clarity
- Examples of good naming:
  - `create-guideline.md` (for specific activity of creating guidelines)
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
    - Format: `'relationship_type [[target_element]]'` (e.g., `'implements [[system/text/system-design]]'`)
    - Common relationship types: `implements`, `related_to`, `depends_on`, `extends`, `supersedes`
    - Common targets: guidelines, activities, schemas, design documents
    - Examples:
      - `'implements [[system/schema/guideline]]'`
      - `'related_to [[system/guideline/create-activity]]'`
      - `'supersedes [[system/guideline/old-guideline]]'`

### Content Requirements

- Guidelines MUST use RFC 2119 language (MUST, SHOULD, MAY, etc.) to clearly indicate requirement levels
- Guidelines SHOULD have a clear, hierarchical structure with headings
- Each rule SHOULD include a brief explanation of its rationale
- Guidelines SHOULD include examples where appropriate
