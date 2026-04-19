---
title: Write Task
type: workflow
description: Create a simple or draft task entity with proper schema compliance, folder placement, and tagging
base_uri: sys:system/workflow/write-task.md
created_at: '2025-06-26T01:12:24.554Z'
entity_id: 1b971f77-1344-45bf-8119-a277cc618237
observations:
  - '[process] MCP entity creation ensures proper schema compliance'
  - '[pattern] Shared task setup steps used by implementation plan workflows'
public_read: true
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
visibility_analyzed_at: '2026-02-16T04:42:55.028Z'
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

### 2f: Date-Gated Continuation Prompts

Use the task entity -- not a `scheduled-command` -- when the work is one-time and time-anchored. `scheduled-command` is for recurring or ongoing executions (cron-like); one-time, date-gated follow-ups belong in the task system so they surface through the same queries, status lifecycle, and relationships as every other unit of work.

Apply this pattern when all three hold:

- The work is a single verification, cleanup, or follow-up step tied to a specific moment (`24h after deploy`, `next billing cycle`, `after PR merges upstream`).
- It is self-contained enough to execute from the task body without a live back-and-forth session.
- Running it earlier than the anchor provides no value (premature), and running it much later still provides value (soft deadline, not hard).

Frontmatter fields:

- `status: Planned` -- the body is self-contained and actionable by an agent in a new context window.
- `priority` -- inherit from the parent task that spawned the follow-up (do not invent a new priority).
- `tags` -- inherit the parent's primary tag.
- `snooze_until` -- ISO timestamp for when the reminder should resurface (the earliest point at which running it makes sense).
- `finish_by` -- ISO timestamp for the soft deadline (typically `snooze_until` plus a reasonable grace window; the point after which the work is stale or pointless).
- `relations` -- `relates [[...]]` back to the parent task; `succeeds [[...]]` to any sibling continuation tasks that must run before this one (e.g., 24h check precedes 30-day check).

Body structure (four sections, in this order):

1. **Context** -- what was deployed, relevant commit SHAs or entity IDs, parent-task reference. Enough for a cold reader to understand what triggered this follow-up without reading the parent.
2. **Steps** -- exact shell commands or CLI invocations, copy-pasteable. Include fallbacks if the primary command may return empty.
3. **Interpretation** -- a decision tree for each plausible outcome, including which observation to record on the parent, whether to close the parent task, and whether to file new follow-ups.
4. **Key locations** -- absolute paths, SSH aliases, and related entity URIs for progressive disclosure. Let the executing session decide what to read; do not inline file contents.

Naming: `verify-<subject>-<window>.md` (e.g., `-24h`, `-7d`, `-30d`) keeps related continuations sortable and greppable next to each other.

The four-section body structure is recommended, not mandatory. For truly trivial continuations ("re-run X on date Y"), a single paragraph is fine; preserve the frontmatter fields regardless.

## Step 3: Create Entity

- **Before creating, verify the target path does not already exist.** If a file exists at the path, inform the user and choose an alternative name to avoid overwriting existing work.
- Use `base entity create` CLI (via Bash tool) with base_uri pattern `user:task/<subfolder>/task-name.md`
- Set `--type` to "task"
- Set `title` to the task name and include a brief `description`
- Pass `status`, `priority`, `tags`, and `relations` inside `--properties` JSON (these are NOT top-level CLI flags). Example: `--properties '{"status": "Planned", "priority": "Medium", "tags": ["user:tag/my-tag.md"]}'`

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
