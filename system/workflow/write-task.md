---
title: Write Task
type: workflow
description: >-
  Create a simple or draft task entity with proper schema compliance, folder
  placement, and tagging
base_uri: sys:system/workflow/write-task.md
created_at: '2025-06-26T01:12:24.554Z'
entity_id: 1b971f77-1344-45bf-8119-a277cc618237
observations:
  - '[process] MCP entity creation ensures proper schema compliance'
  - '[pattern] Shared task setup steps used by implementation plan workflows'
relations:
  - follows [[sys:system/guideline/write-task.md]]
  - follows [[sys:system/guideline/choose-task-status.md]]
  - follows [[sys:system/guideline/choose-task-priority.md]]
  - implements [[sys:system/schema/task.md]]
  - creates [[sys:system/schema/task.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - follows [[sys:system/guideline/write-entity.md]]
  - follows [[sys:system/text/base-uri.md]]
updated_at: '2026-02-14T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Write Task

<task>Create a properly structured task entity using the MCP entity creation tool</task>

<context>
User wants to create a new task. This workflow handles simple and draft tasks directly. For tasks requiring multi-phase research, design, and detailed planning, use the implementation plan workflows instead:

- [[sys:system/workflow/write-software-implementation-plan.md]] - for tasks involving code changes
- [[sys:system/workflow/write-general-implementation-plan.md]] - for tasks without codebase interaction
</context>

<instructions>

## Step 1: Gather Requirements

- Confirm the task title (descriptive, action-oriented)
- Determine if priority or deadline is needed
- Identify any relationships to other entities
- **Ask the user** to clarify any ambiguity in scope, intent, or expected outcome before proceeding
- If the user's request is vague, ask specific questions rather than making assumptions

## Step 2: Task Entity Setup

These steps apply to all task creation, including when called from implementation plan workflows.

### 2a: Read the Task Schema and Guidelines

- Read [[sys:system/schema/task.md]] to understand canonical fields
- Read [[sys:system/guideline/write-entity.md]] for entity writing standards
- Read [[sys:system/text/base-uri.md]] for URI conventions
- Read [[sys:system/guideline/choose-task-status.md]] for status selection
- Read [[sys:system/guideline/choose-task-priority.md]] for priority selection

### 2b: Determine Folder Placement

- List the existing subdirectories under `task/` to see current project organization
- Place the task in the subdirectory that best matches its project or domain
- If no existing subdirectory fits, ask the user whether to create a new one or use the top-level `task/` directory
- If uncertain about placement, ask the user

### 2c: Select Tags

- Check the `tag/` directory for applicable tags
- Select ONE primary tag for grouping purposes
- Add to entity_properties as `tags: [user:tag/<tag-name>.md]`
- See [[user:guideline/tag-standards.md]] for selection criteria

### 2d: Determine Status

Set the initial status based on whether the task content is **actionable by an agent in a new context window** without further clarification:

- **Planned** - The task has enough detail that an agent with no prior context could read the task entity and achieve the desired outcome. The scope, steps, and expected result are clear.
- **Draft** - The task captures intent but lacks sufficient detail for independent execution. It needs further refinement, research, or an implementation plan before it can be acted on.

When unsure, prefer **Draft** -- it is better to refine a task than to attempt execution with insufficient context.

### 2e: Determine Priority

- Follow [[sys:system/guideline/choose-task-priority.md]] for selection criteria
- When in doubt, assign **Medium** and adjust based on feedback
- Ask the user if priority is unclear from context

## Step 3: Create Entity

- Use `mcp__base__entity_create` with base_uri pattern `user:task/<subfolder>/task-name.md`
- Set entity_type to "task"
- Set `title` to the task name and include a brief `description`
- Set `status` and `priority` per Steps 2d and 2e
- Include tags in entity_properties

## Step 4: Structure Content

- Write clear, concise task description
- Use bullet points for multi-step work
- Add context only if necessary for completion
- Include enough detail for the status level chosen:
  - **Planned** tasks must be self-contained and actionable
  - **Draft** tasks should capture intent and known context for later refinement

## Step 5: Set Relationships

- Link to parent tasks, projects, or dependencies
- Connect required items or tools
- Specify assignments if applicable

</instructions>

<output_format>
Create the task entity using the MCP tool and confirm successful creation with the generated entity_id and path.
</output_format>
