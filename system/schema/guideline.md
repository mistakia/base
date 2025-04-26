---
type: type_definition
type_name: guideline
title: Guideline
extends: base
description: Guidelines represent standards, procedures, or best practices
properties:
  - name: guideline_status
    type: string
    enum: [Draft, Approved, Deprecated]
    required: false
    description: Current status of the guideline
  - name: effective_date
    type: date
    optional: true
    description: Date when the guideline becomes effective
  - name: activities
    type: array
    items:
      type: string
    required: true
    description: Activities this guideline applies to
  - name: globs
    type: array
    items:
      type: string
    optional: true
    description: Glob patterns for files that this guideline applies to
  - name: always_apply
    type: boolean
    optional: true
    description: Whether this guideline should always be applied
---

# Guideline

Guidelines represent standards, procedures, or best practices that should be followed when performing activities or completing tasks.

## Purpose

Guidelines serve to:

- Standardize processes
- Document best practices
- Shape system behavior based on user preferences
- Maintain quality standards
- Provide consistency across operations

## Relations

Guidelines commonly relate to:

- activities (processes they govern)
- tasks (work that follows these guidelines)
- organizations (groups that adopt these guidelines)
- persons (individuals who create or follow guidelines)

Example:

```yaml
relations:
  - 'follows [[system/activities/activity-name]]'
  - 'applies_to [[data/tasks/task-name]]'
  - 'adopted_by [[system/organization/org-name]]'
  - 'created_by [[data/person/jane-doe]]'
```
