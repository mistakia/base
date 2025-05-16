---
type: type_definition
title: Activity
type_name: activity
extends: base
description: Activities represent actions or processes
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

Activities commonly use these relation types:

- `follows`: Guidelines related to this activity (formerly guidelines)
- `assigned_to`: People who typically perform the activity
- `involves`: Organizations responsible for the activity

Example:

```yaml
relations:
  - 'follows [[system/guidelines/guideline-name]]'
  - 'assigned_to [[user/person/jane-doe]]'
  - 'involves [[system/organization/org-name]]'
```
