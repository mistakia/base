---
title: Create Guideline
type: guideline
description: Guidelines for creating new guidelines that define standards and principles
base_uri: sys:system/guideline/write-guideline.md
created_at: '2025-05-27T18:10:20.239Z'
entity_id: 55c0f40b-3c54-44f9-8366-8c0d91d72986
globs:
  - guideline/**/*.md
observations:
  - '[governance] Clear naming conventions improve discoverability #naming'
  - '[standard] RFC 2119 language clarifies requirement levels #clarity'
  - '[distinction] Guidelines define reusable standards, workflows define specific processes'
  - '[philosophy] Start with core beliefs and iterate based on actual needs'
relations:
  - related_to [[sys:system/guideline/write-workflow.md]]
  - implements [[sys:system/text/system-design.md]]
  - implements [[sys:system/schema/guideline.md]]
  - follows [[user:guideline/starting-point-philosophy.md]]
updated_at: '2026-01-05T19:25:02.704Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Create Guideline

Follow the [[user:guideline/starting-point-philosophy.md]] when creating guidelines.

## Purpose and Distinction

Guidelines define standards, principles, and reusable information that apply across multiple contexts. They establish "what" and "why" rather than "how."

**Guidelines vs Workflows:**

- **Guidelines**: Define standards, principles, conventions, and reusable information relevant to many workflows
- **Workflows**: Define specific step-by-step processes, tools, and decision-making for particular tasks

Information that may be relevant to many workflows MUST go in guidelines, not duplicated across workflows.

## Guidelines

### File Structure and Naming

- Guidelines MUST be stored in the appropriate location:
  - System guidelines MUST be stored in `sys:system/guideline/`
  - User guidelines MUST be stored in `user:guideline/`
- Guidelines MUST be named following these patterns:
  - For standards and conventions: `verb-object.md` (e.g., `write-guideline.md`, `name-files.md`)
  - For categories of standards: `category-descriptor.md` (e.g., `code-review-standards.md`, `api-design-principles.md`)
  - Names MUST use kebab-case format
  - Names MUST be specific and descriptive
  - Names SHOULD be concise while maintaining clarity

### Content Focus

Guidelines MUST focus on:

- Standards and conventions
- Principles and best practices
- Reusable information applicable to multiple workflows
- Requirements and constraints
- Quality criteria and acceptance standards

Guidelines MUST NOT include:

- Step-by-step processes (use workflows instead)
- Tool-specific instructions (use workflows instead)
- Decision trees or conditional logic (use workflows instead)

### Frontmatter

- Guidelines MUST follow the schema defined in `sys:system/schema/guideline.md`
- Guidelines MUST include complete frontmatter with these fields:
  - `title`: Clear, specific, and descriptive title
  - `type`: Always set to "guideline"
  - `description`: Brief summary of the guideline's purpose
  - `tags`: Relevant categories and topics
- Guidelines SHOULD include these additional fields when applicable:
  - `globs`: File patterns this guideline applies to
  - `workflows`: Related workflows this guideline supports
  - `observations`: Key insights or principles behind the guideline
  - `relations`: Connections to other system elements using the wikilink format with relationship type:
    - Format: `'relationship_type [[target_element_base_uri]]'` (e.g., `'implements [[sys:system/schema/guideline.md]]'`)
    - Common relationship types: `implements`, `related_to`, `depends_on`, `extends`, `supersedes`
    - Common targets: guidelines, workflows, schemas, design documents

### Content Requirements

- Guidelines MUST use RFC 2119 language (MUST, SHOULD, MAY, etc.) to clearly indicate requirement levels
- Each rule SHOULD be clear and concise so the rationale is self-evident
- Guidelines SHOULD include examples when they clarify the standard
- Guidelines SHOULD reference related workflows that implement the standards
