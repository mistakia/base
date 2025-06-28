---
title: 'Choose Task Status Guideline'
type: 'guideline'
description: |
  Guidelines for choosing appropriate task statuses
created_at: '2025-05-27T18:10:20.237Z'
globs:
  - 'task/**/*.md'
entity_id: '3ba5ef17-c90a-463c-8890-5c8e635e3297'
observations:
  - '[standard] Standardized status values ensure consistent task management'
  - '[governance] Limited set of statuses helps with workflow automation'
  - '[organization] Clear status values improve task tracking and reporting'
tags:
updated_at: '2025-05-27T18:10:20.237Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Choose Task Status Guideline

## Guidelines

- The status of a task MUST be one of the following: 'No status', 'Waiting', 'Paused', 'Planned', 'Started', 'In Progress', 'Completed', 'Cancelled', 'Blocked'.

### Status Descriptions

- **No status**: New task that hasn't been reviewed yet, or planned for beyond the next few months
- **Waiting**: Blocked by external factors not under our control
- **Paused**: Temporarily put on hold by decision
- **Planned**: Scheduled for the coming weeks or months
- **Started**: Begun but hasn't been worked on in recent days
- **In Progress**: Actively worked on each day
- **Completed**: Finished successfully
- **Cancelled**: Decided not to complete
- **Blocked**: Blocked by internal dependencies under our control
