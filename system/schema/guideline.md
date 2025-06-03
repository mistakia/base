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

Guidelines represent standards, procedures, or best practices that should be followed when performing executing workflows and completing tasks.

## Purpose

Guidelines serve to:

- Standardize processes
- Document best practices
- Shape system behavior based on user preferences
- Maintain quality standards
- Provide consistency across operations

## Relations

Guidelines commonly relate to:

- workflows
- tasks

Example:

```yaml
relations:
  - 'used_by [[system/workflow/workflow-name]]'
  - 'applies_to [[user/tasks/task-name]]'
```
