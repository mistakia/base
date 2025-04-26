---
type: type_definition
type_name: task
title: Task
extends: base
description: Tasks represent discrete units of work that need to be completed
properties:
  - name: status
    type: string
    enum:
      [
        No status,
        Waiting,
        Paused,
        Planned,
        Started,
        In Progress,
        Completed,
        Cancelled,
        Blocked
      ]
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
    enum: [None, Low, Medium, High, Critical]
    required: false
    description: Priority level of the task
---

# Task

Tasks represent discrete units of work that need to be completed. They can be standalone or part of a larger project or process.

## Task Management

Tasks support a complete workflow lifecycle:

- Planning (with duration estimates)
- Scheduling (with planned start/finish times)
- Execution (with actual start/finish tracking)
- Dependencies (with parent/dependent task relationships)
- Resource allocation (with assignments and required items)

## Relations

Tasks commonly use these relation types:

- `child_of`: Tasks that this task is a subtask of (formerly parent_tasks)
- `depends_on`: Tasks that depend on this task (formerly dependent_tasks)
- `executes`: Activities related to this task (formerly activities)
- `involves`: Organizations involved in this task (formerly organizations)
- `assigned_to`: People assigned to this task (formerly persons)
- `requires`: Physical and digital items needed for this task (formerly physical_items/digital_items)

Example:

```yaml
relations:
  - 'child_of [[data/tasks/parent-task]]'
  - 'depends_on [[data/tasks/dependent-task]]'
  - 'executes [[system/activities/activity-name]]'
  - 'involves [[system/organization/org-name]]'
  - 'assigned_to [[data/person/jane-doe]]'
  - 'requires [[system/physical_item/item-name]] (quantity: 2)'
  - 'requires [[system/digital_item/item-name]]'
```
