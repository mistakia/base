---
title: Create Workflow Guideline
type: guideline
description: Guidelines for creating new workflows
base_uri: sys:system/guideline/write-workflow.md
created_at: '2025-05-27T18:10:20.237Z'
entity_id: e1cfc594-78bb-49ef-a1f3-3575f4ecefe8
globs:
  - workflow/**/*.md
observations:
  - '[governance] Proper workflow location ensures system organization'
  - '[principle] Clear naming conventions improve discoverability'
  - '[organization] System vs user classification is based on scope of use'
  - '[standard] Workflow design should enable composability and reuse'
  - '[pattern] XML tags provide clear structure for workflow prompts'
  - '[philosophy] Start with core beliefs and iterate based on actual needs'
relations:
  - implements [[sys:system/text/system-design.md]]
  - implements [[sys:system/schema/workflow.md]]
  - related_to [[sys:system/guideline/write-guideline.md]]
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
updated_at: '2026-01-05T19:25:18.038Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

Read [[sys:system/text/workflow.md]] to understand what a workflow is and how it is used. Follow the [[sys:system/guideline/starting-point-philosophy.md]] when creating workflows.

### File Structure and Naming

- Workflows MUST be stored in the appropriate location:
  - System workflows MUST be stored in `system/workflow/`
  - User workflows MUST be stored in `user/workflow/`
- Workflows MUST be named using descriptive, action-oriented names:
  - Names MUST use kebab-case format (e.g., `write-general-implementation-plan.md`, `summarize-document.md`)
  - Names SHOULD start with a verb that describes the primary action
  - Names MUST be specific and descriptive of the workflow's purpose
  - Names SHOULD be concise while maintaining clarity
- Examples of good naming:
  - `take-notes.md` (for note-taking workflow)
  - `update-entity.md` (for entity management workflow)
  - `merge-worktree.md`
- Workflows that would be used by every single user are considered system workflows
- Workflows that may be used by some users but not others are considered user workflows

### Frontmatter Requirements

- Workflows MUST follow the schema defined in `sys:system/schema/workflow.md`
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
  - 'follows [[sys:system/guideline/write-workflow.md]]'
  - 'calls [[sys:system/workflow/find-information.md]]'
  - 'implements [[sys:system/schema/workflow.md]]'
```

### Content Requirements

#### Workflow Body Structure

- Workflows MUST use clear XML tags to structure the workflow content:
  ```markdown
  <task>Primary objective of the workflow</task>
  <context>Background information and situational context</context>
  <instructions>Step-by-step guidance for executing the workflow</instructions>
  <output_format>Expected response format or deliverables</output_format>
  ```

#### Content Guidelines

- Workflows MUST include clear, step-by-step instructions in the `<instructions>` section
- Workflows SHOULD have a clear, hierarchical structure with bullet points or numbered lists
- Complex workflows SHOULD be broken down into logical sections
- Workflows SHOULD include documentation on:
  - Expected inputs and outputs
  - Error handling and edge cases
  - Examples of usage in different contexts
- Workflows that call other workflows SHOULD clearly document these dependencies

### Workflow Design Best Practices

#### Design Principles

- Workflows SHOULD be focused on a single workflow or task type
- Workflows SHOULD start with essential elements and expand based on actual usage
- Workflows SHOULD include examples of expected input/output
- Workflows SHOULD reference relevant project documentation
- Workflows SHOULD specify when to update task states or create todos
- Workflows SHOULD enable composability and reuse

#### Composability and Execution Model

Workflows SHOULD be small, focused units that do one thing well. Complex processes SHOULD be decomposed into distinct workflows.

**Choosing execution method:**

| Use Case                                               | Method             | Reason                                                |
| ------------------------------------------------------ | ------------------ | ----------------------------------------------------- |
| Workflow requires human review between phases          | Claude CLI         | User can review output and decide whether to continue |
| Workflow can run to completion autonomously            | Task/subagent tool | No intervention needed                                |
| Workflow produces output requiring user decision       | Claude CLI         | Natural breakpoint for human input                    |
| Workflow is a leaf operation (research, single action) | Task/subagent tool | Self-contained execution                              |

**Claude CLI invocation** (for workflows requiring human review):

```bash
claude-session "Run workflow [[user:workflow/example.md]] with input: [context]"
```

**Workflow handoff pattern** (in `<instructions>` section):

```markdown
## Handoff

Present results to user. To continue with the next phase:

\`\`\`bash
claude-session "Run [[user:workflow/next-phase.md]] for task [[user:task/example.md]]"
\`\`\`
```

Use the `calls` relation to document workflow dependencies.

#### Documentation Standards

- Workflows SHOULD include a clear description in the `<task>` section
- Workflows SHOULD specify expected input format in the `<context>` section
- Workflows SHOULD document any prerequisites or assumptions
- Workflows SHOULD provide clear guidance in the `<instructions>` section

#### Error Handling

- Workflows SHOULD provide guidance for common error scenarios
- Workflows SHOULD specify fallback behavior when inputs are missing
- Workflows SHOULD include validation steps for critical operations
