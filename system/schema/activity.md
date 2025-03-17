---
title: Activity
type: type_definition
extends: base
description: Activities represent actions or processes
properties:
  - name: guidelines
    type: array
    items:
      type: string
    required: false
    description: Guidelines related to this activity
---

# Activity

Activities represent actions or processes. They can be linked to guidelines, tasks, and other content types to provide a complete picture of work processes.

## Examples

Activities might include:

- Software development processes
- Manufacturing procedures
- Operational workflows
- Recurring actions

## Relations

Activities commonly relate to:

- guidelines (Instructions for how to perform the activity)
- tasks (Specific instances of the activity being performed)
- persons (People who typically perform the activity)
- organizations (Teams/groups that are responsible for the activity)
