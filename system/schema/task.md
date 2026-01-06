---
title: Task Schema
type: type_definition
description: Tasks represent discrete units of work that need to be completed
base_uri: sys:system/schema/task.md
created_at: '2025-08-16T17:56:08.206Z'
entity_id: 5bfafc54-c72a-43bb-8f77-61cbd843abaf
extends: entity
properties:
  - name: status
    type: string
    enum:
      - No status
      - Waiting
      - Paused
      - Planned
      - Started
      - In Progress
      - Completed
      - Abandoned
      - Blocked
    required: false
    description: Current status of the task
  - name: start_by
    type: datetime
    required: false
    description: Date by which the task should be started
  - name: finish_by
    type: datetime
    required: false
    description: Due date for task completion
  - name: estimated_total_duration
    type: number
    required: false
    description: Estimated total hours to complete the task
  - name: estimated_preparation_duration
    type: number
    required: false
    description: Estimated hours for preparation phase
  - name: estimated_execution_duration
    type: number
    required: false
    description: Estimated hours for execution phase
  - name: estimated_cleanup_duration
    type: number
    required: false
    description: Estimated hours for cleanup phase
  - name: actual_duration
    type: number
    required: false
    description: Actual hours spent on the task
  - name: planned_start
    type: datetime
    required: false
    description: Scheduled start time
  - name: planned_finish
    type: datetime
    required: false
    description: Scheduled finish time
  - name: started_at
    type: datetime
    required: false
    description: Actual start time
  - name: finished_at
    type: datetime
    required: false
    description: Actual completion time
  - name: snooze_until
    type: datetime
    required: false
    description: Date/time to postpone the task until
  - name: assigned_to
    type: string
    required: false
    description: Person or team responsible for the task
  - name: priority
    type: string
    enum:
      - None
      - Low
      - Medium
      - High
      - Critical
    required: false
    description: Priority level of the task
  - name: abandoned_reason
    type: string
    required: false
    description: Reason why the task was abandoned
type_name: task
updated_at: '2026-01-05T19:25:18.586Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Task

Tasks represent discrete units of work that need to be completed. They can be standalone or part of a larger project or process.

## Task Management

Tasks support a complete workflow lifecycle:

- Planning (with duration estimates)
- Scheduling (with planned start/finish times)
- Execution (with actual start/finish tracking)
- Dependencies (with task relationships)
- Resource allocation (with assignments and required items)

## Relations

Tasks commonly use these relation types:

- `subtask_of`: This task is a subtask of another task
- `has_subtask`: This task has subtasks
- `blocked_by`: This task cannot start/finish until another task is complete (hard dependency)
- `blocks`: This task blocks another task (hard dependency)
- `precedes`: It is beneficial to complete this task before another (soft dependency)
- `succeeds`: It is beneficial to complete this task after another (soft dependency)
- `relates_to`: This task is related to another task in a non-specific way
- `needs_item`: This task requires a physical or digital resource
- `uses_item`: This task uses a tool (physical or digital)
- `assigned_to`: Person or team responsible for the task

Example:

```yaml
relations:
  - 'subtask_of [[user:tasks/parent-task]]'
  - 'blocked_by [[user:tasks/other-task]]'
  - 'precedes [[user:tasks/optional-prereq-task]]'
  - 'relates_to [[user:tasks/related-task]]'
  - 'needs_item [[sys:physical-item/laptop]] (quantity: 1)'
  - 'uses_item [[sys:digital-item/figma]]'
  - 'assigned_to [[user:person/jane-doe]]'
```
