---
title: Create Task Relationships
type: guideline
description: Guidelines for creating and selecting appropriate task relationships
base_uri: sys:system/guideline/create-task-relationships.md
created_at: '2025-05-27T18:10:20.235Z'
entity_id: 68470987-1a98-4228-8bce-abee8a848517
globs:
  - task/**/*.md
observations:
  - Task relationships create structure and context in a task management system
  - Clear relationship definitions improve task planning and execution
  - Consistent relationship usage enhances reporting and visibility
public_read: true
relations:
  - implements [[sys:system/schema/task.md]]
updated_at: '2026-01-05T19:24:59.839Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:26:53.372Z'
---

This guideline helps determine appropriate relationships for tasks, defining connections between tasks, people, and resources.

## Types of Task Relationships

Task relationships fall into four main categories:

1. **Hierarchical Relationships** - Define task/subtask structure
2. **Dependency Relationships** - Define execution order requirements
3. **Resource Relationships** - Define what items are needed
4. **Assignment Relationships** - Define who is responsible

## Hierarchical Relationships

Hierarchical relationships establish parent-child relationships between tasks.

### `subtask_of`

**Definition:** This task is a component or subset of a larger task.

**When to use:**

- MUST use when the task is a specific part of a larger task
- MUST use when breaking down complex tasks into manageable components
- SHOULD use when the task inherits context from a parent task

**Example:**

```yaml
relations:
  - 'subtask_of [[user:tasks/redesign-website.md]]'
```

### `parent_of`

**Definition:** This task contains or is composed of other smaller tasks.

**When to use:**

- MUST use when the task has been broken down into subtasks
- SHOULD use to indicate the inverse relationship of `subtask_of`
- MAY use to create task hierarchies for reporting

**Example:**

```yaml
relations:
  - 'parent_of [[user:tasks/update-navigation.md]]'
  - 'parent_of [[user:tasks/optimize-images.md]]'
```

## Dependency Relationships

Dependency relationships establish execution order and prerequisites.

### `blocked_by`

**Definition:** This task cannot start or be completed until another task is finished (hard dependency).

**When to use:**

- MUST use when the task absolutely requires another task to be completed first
- MUST use when technical dependencies exist between tasks
- SHOULD use when identifying critical path dependencies

**Example:**

```yaml
relations:
  - 'blocked_by [[user:tasks/setup-database.md]]'
```

### `blocks`

**Definition:** This task prevents another task from starting or being completed (hard dependency).

**When to use:**

- MUST use when this task must be completed before another can start
- SHOULD use to indicate the inverse relationship of `blocked_by`
- MAY use to identify tasks blocking critical path progression

**Example:**

```yaml
relations:
  - 'blocks [[user:tasks/deploy-application.md]]'
```

### `precedes`

**Definition:** It is beneficial (but not required) to complete this task before another (soft dependency).

**When to use:**

- SHOULD use when there's efficiency in completing this task before another
- SHOULD use when this task provides helpful context for another
- MAY use for recommended but not required sequencing

**Example:**

```yaml
relations:
  - 'precedes [[user:tasks/user-testing.md]]'
```

### `follows`

**Definition:** It is beneficial (but not required) to complete this task after another (soft dependency).

**When to use:**

- SHOULD use when there's efficiency in completing this task after another
- SHOULD use when another task provides helpful context for this one
- MAY use for recommended but not required sequencing

**Example:**

```yaml
relations:
  - 'follows [[user:tasks/gather-requirements.md]]'
```

### `relates_to`

**Definition:** This task is related to another task in a non-specific way.

**When to use:**

- SHOULD use when tasks share a common goal but have no specific dependency
- SHOULD use when tasks affect the same system or component
- MAY use to create loose associations for context

**Example:**

```yaml
relations:
  - 'relates_to [[user:tasks/update-documentation.md]]'
```

## Resource Relationships

Resource relationships connect tasks to the items needed for completion.

### `needs_item`

**Definition:** This task requires a physical or digital resource/item to be completed.

**When to use:**

- MUST use when the task requires specific resources to be available
- SHOULD use when the resource must be reserved or allocated
- MAY include quantity information if relevant

**Example:**

```yaml
relations:
  - 'needs_item [[sys:physical-item/meeting-room.md]] (quantity: 1)'
  - 'needs_item [[sys:digital-item/license-key.md]]'
```

### `uses_item`

**Definition:** This task involves the use of a tool (physical or digital) as part of its execution.

**When to use:**

- SHOULD use when the task involves operating or utilizing a specific tool
- SHOULD use for tools that are actively manipulated during the task
- MAY use to indicate required skills (by referencing the tools)

**Example:**

```yaml
relations:
  - 'uses_item [[sys:digital-item/figma.md]]'
  - 'uses_item [[sys:physical-item/camera.md]]'
```

## Assignment Relationships

Assignment relationships connect tasks to the people or teams responsible.

### `assigned_to`

**Definition:** Person or team responsible for completing the task.

**When to use:**

- MUST use when assigning responsibility for task completion
- SHOULD use to indicate who is accountable for the task
- MAY include multiple assignments if task has shared responsibility

**Example:**

```yaml
relations:
  - 'assigned_to [[user:person/jane-doe.md]]'
  - 'assigned_to [[sys:team/design.md]]'
```

## Decision Guide: Choosing the Right Relationship

When determining which relationships to apply to a task, ask these questions:

1. **Hierarchy**: Is this task part of a larger task or composed of smaller tasks?

   - If part of larger task → use `subtask_of`
   - If contains smaller tasks → use `parent_of`

2. **Dependencies**: Does this task have ordering requirements with other tasks?

   - If cannot start until another task completes → use `blocked_by`
   - If prevents another task from starting → use `blocks`
   - If would be efficient to complete before another → use `precedes`
   - If would be efficient to complete after another → use `follows`
   - If conceptually related but no ordering → use `relates_to`

3. **Resources**: What items are needed for this task?

   - If requires resources to be available → use `needs_item`
   - If requires active use of tools → use `uses_item`

4. **Assignment**: Who is responsible for this task?
   - Use `assigned_to` to indicate responsibility

## Complete Example

```yaml
relations:
  - 'subtask_of [[user:tasks/website-redesign.md]]'
  - 'blocked_by [[user:tasks/finalize-design.md]]'
  - 'precedes [[user:tasks/browser-testing.md]]'
  - 'relates_to [[user:tasks/update-documentation.md]]'
  - 'needs_item [[sys:digital-item/hosting-account.md]]'
  - 'uses_item [[sys:digital-item/vs-code.md]]'
  - 'assigned_to [[user:person/jane-doe.md]]'
```
