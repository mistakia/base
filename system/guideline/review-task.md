---
title: Review Task Entity
type: guideline
description: Ensure task entities comply with task schema during workflow execution
base_uri: user:repository/active/base/system/guideline/review-task.md
created_at: '2025-08-23T23:47:47.792Z'
entity_id: 2ba6a096-6c5b-4648-90aa-9491764abdc0
observations:
  - '[entity] Task entities require proper status management during workflow execution'
  - '[status] Task status must be set to "In Progress" when beginning implementation workflows'
  - '[schema] Task status values must comply with the task schema enumeration'
relations:
  - implements [[sys:system/schema/guideline.md]]
  - related_to [[sys:system/guideline/write-guideline.md]]
  - applies [[sys:system/schema/task.md]]
  - supports [[sys:system/workflow/implement-software-task.md]]
  - supports [[sys:system/workflow/implement-general-task.md]]
updated_at: '2026-01-05T19:25:18.012Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Review Task Entity

## Purpose

Ensure `task` entities comply with the task schema specification during workflow execution.

## Task Schema Compliance

### Status Management

- Task status MUST use only values from schema enumeration: "No status", "Waiting", "Paused", "Planned", "Started", "In Progress", "Completed", "Abandoned", "Blocked"
- When beginning workflow execution, set task status to "In Progress" if not already set
- Update task status throughout workflow execution to reflect current state

### Property Validation

- Validate all task properties against schema before workflow execution
- Ensure datetime fields use proper ISO format where specified
- Verify enum values (status, priority) match schema definitions
- Update `started_at` timestamp when status changes to "Started" or "In Progress"
- Update `finished_at` timestamp when status changes to "Completed" or "Abandoned"
