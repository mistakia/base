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
  - name: parent_tasks
    type: array
    items:
      type: string
    required: false
    description: Tasks that this task is a subtask of
  - name: dependent_tasks
    type: array
    items:
      type: string
    required: false
    description: Tasks that depend on this task
  - name: activities
    type: array
    items:
      type: string
    required: false
    description: Activities related to this task
  - name: organizations
    type: array
    items:
      type: string
    required: false
    description: Organizations involved in this task
  - name: persons
    type: array
    items:
      type: string
    required: false
    description: People involved in this task
  - name: physical_items
    type: array
    items:
      type: string
    required: false
    description: Physical items needed for this task
  - name: digital_items
    type: array
    items:
      type: string
    required: false
    description: Digital items needed for this task
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

Tasks commonly relate to:

- other tasks (parent/dependent relationships)
- activities (processes being executed)
- persons (who perform the task)
- organizations (teams responsible for the task)
- physical_items (tools or materials needed)
- digital_items (files or software needed)
