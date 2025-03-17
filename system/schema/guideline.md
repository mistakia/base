---
title: Guideline
type: type_definition
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
    required: false
    description: Date when the guideline becomes effective
  - name: activities
    type: array
    items:
      type: string
    required: false
    description: Activities this guideline applies to
---

# Guideline

Guidelines represent standards, procedures, or best practices that should be followed when performing activities or completing tasks.

## Purpose

Guidelines serve to:

- Standardize processes
- Document best practices
- Ensure compliance with regulations
- Maintain quality standards
- Provide consistency across operations

## Lifecycle

Guidelines typically follow a lifecycle:

1. Draft - Initial creation and refinement
2. Approved - Formally accepted and implemented
3. Deprecated - No longer in use or replaced by newer guidelines

## Relations

Guidelines commonly relate to:

- activities (processes they govern)
- tasks (work that follows these guidelines)
- organizations (groups that adopt these guidelines)
- persons (individuals who create or follow guidelines)
