---
title: 'Create Workflow Guideline'
type: 'guideline'
description: |
  Guidelines for creating new workflows
created_at: '2025-05-27T18:10:20.237Z'
entity_id: 'e1cfc594-78bb-49ef-a1f3-3575f4ecefe8'
globs:
  - 'workflow/**/*.md'
guideline_status: 'Approved'
observations:
  - '[governance] Proper workflow location ensures system organization'
  - '[principle] Clear naming conventions improve discoverability'
  - '[organization] System vs user classification is based on scope of use'
  - '[standard] Workflow design should enable composability and reuse'
relations:
  - 'implements [[sys:text/system-design.md]]'
  - 'implements [[sys:schema/workflow.md]]'
  - 'related_to [[sys:guideline/write-guideline.md]]'
tags:
updated_at: '2025-05-27T18:10:20.237Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Create Workflow Guideline

## Guidelines

### File Structure and Naming

- Workflows MUST be stored in the appropriate location:
  - System workflows MUST be stored in `system/workflow/`
  - User workflows MUST be stored in `user/workflow/`
- Workflows MUST be named using descriptive, action-oriented names:
  - Names MUST use kebab-case format (e.g., `find-storage-location.md`, `summarize-document.md`)
  - Names SHOULD start with a verb that describes the primary action
  - Names MUST be specific and descriptive of the workflow's purpose
  - Names SHOULD be concise while maintaining clarity
- Examples of good naming:
  - `take-notes.md` (for note-taking workflow)
  - `find-storage-location.md` (for storage determination workflow)
  - `update-or-create-entity.md` (for entity management workflow)
  - `summarize-document.md` (for document summarization workflow)
- Workflows that are generic and would be used by every single user are considered system workflows
- Workflows that may be used by some users but not others are considered user workflows

### Frontmatter Requirements

- Workflows MUST follow the schema defined in `sys:schema/workflow.md`
- Workflows MUST include complete frontmatter with these fields:
  - `title`: Clear, specific, and descriptive title
  - `type`: Always set to "workflow"
  - `description`: Brief summary of the workflow's purpose
  - `tags`: Relevant categories and topics
- Workflows SHOULD include these additional fields when applicable:
  - `prompt_properties`: Input parameters the workflow requires
  - `tools`: List of tools available to the workflow
  - `tool_definition`: Custom tools specific to the workflow
  - `observations`: Key insights or principles behind the workflow
  - `relations`: Connections to other system elements using the wikilink format
    - Common relationship types: `follows`, `calls`, `implements`, `related_to`
    - Examples:

```yaml
relations:
  - 'follows [[sys:guideline/write-workflow.md]]'
  - 'calls [[sys:workflow/find-information.md]]'
  - 'implements [[sys:schema/workflow.md]]'
```

### Content Requirements

- Workflows MUST include clear, step-by-step instructions in the main content
- Workflows SHOULD have a clear, hierarchical structure with bullet points or numbered lists
- Complex workflows SHOULD be broken down into logical sections
- Workflows SHOULD include documentation on:
  - Expected inputs and outputs
  - Error handling and edge cases
  - Examples of usage in different contexts
- Workflows that call other workflows SHOULD clearly document these dependencies
