---
title: Choose Task Priority Guideline
type: guideline
description: Guidelines for choosing appropriate task priorities
base_uri: sys:system/guideline/choose-task-priority.md
created_at: '2023-06-04T12:00:00.000Z'
entity_id: fd9843c8-14a2-4736-83b2-873a6a8f5816
globs:
  - task/**/*.md
observations:
  - '[standard] Standardized priority values ensure consistent task management'
  - '[governance] Limited set of priorities helps with workflow automation'
  - '[organization] Clear priority levels improve resource allocation and planning'
public_read: true
updated_at: '2026-01-05T19:25:18.071Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:26:06.204Z'
---

# Choose Task Priority Guideline

## Guidelines

- The priority of a task MUST be one of the following: 'Critical', 'High', 'Medium', 'Low', 'None'.

### Priority Definitions

- **Critical**: Must be completed either immediately or before an unscheduled adverse event occurs. Takes precedence over all other work. Includes system failures, security issues, business-critical deadlines, and essential preventative measures that must be addressed before it's too late.
- **High**: Offers the most return, reward, or value and should be addressed as soon as possible.
- **Medium**: Good to have and should be addressed through regular order.
- **Low**: Should be completed when most convenient.
- **None**: Mainly used for tasks that do not need to be completed but should be registered for awareness or reference.

### Choosing the Right Priority

- Tasks SHOULD be re-evaluated regularly to ensure their priority remains appropriate
- No more than 20% of active tasks SHOULD have **High** priority at any given time
- When in doubt, assign **Medium** priority and adjust based on feedback
- Consider dependencies when assigning priorities - tasks blocking other work SHOULD have equal or higher priority
