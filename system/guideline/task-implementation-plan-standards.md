---
title: Task Implementation Plan Standards
type: guideline
description: >-
  Standards for valid implementation plans and criteria distinguishing Draft from Planned task
  status
base_uri: sys:system/guideline/task-implementation-plan-standards.md
created_at: '2026-01-28T02:30:00.000Z'
entity_id: f8a92c14-5b73-4e61-9d8f-3c7a2e1b0d45
observations:
  - '[status-semantics] Draft indicates idea capture, Planned indicates actionable with clear steps'
  - >-
    [validation] Implementation plans require both structural elements (headings) and actionable
    items (checkboxes)
  - '[type-distinction] Software tasks reference file paths, general tasks may not'
public_read: true
relations:
  - implements [[sys:system/schema/task.md]]
  - supports [[sys:system/workflow/manage-task-drafts.md]]
  - supports [[sys:system/workflow/triage-draft-task.md]]
updated_at: '2026-01-28T04:45:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:30:00.138Z'
---

# Task Implementation Plan Standards

## Purpose

This guideline defines the criteria for valid implementation plans within task entities and establishes the semantic distinction between Draft and Planned task statuses.

## Task Status Semantics

### Draft Status

A task with `status: Draft` indicates:

- Initial idea capture or rough concept
- Requirements not fully defined
- Scope may be vague or unclear
- No actionable implementation steps yet
- May need research or clarification before planning

Draft tasks are placeholders for future work that require planning before execution.

### Planned Status

A task with `status: Planned` indicates:

- Clear objective with defined scope
- Valid implementation plan present
- Actionable tasks identified
- Ready for execution when prioritized

A task MUST NOT have `status: Planned` without a valid implementation plan. Tasks without valid plans SHOULD be reverted to `status: Draft`.

### Other Statuses

- **Started / In Progress**: Active work has begun; implementation plan MUST exist
- **Completed**: All implementation tasks finished
- **Blocked**: Cannot proceed due to dependency; implementation plan SHOULD exist
- **Waiting**: Waiting on external input; implementation plan SHOULD exist

## Implementation Plan Requirements

### Required Sections

A valid implementation plan MUST contain:

1. **Tasks Section**: One of these headings:

   - `## Tasks`
   - `## Implementation Tasks`
   - `### Tasks` (for nested structure)

2. **Actionable Items**: At least one checkbox item:
   - `- [ ]` (uncompleted task)
   - `- [x]` (completed task)

### Recommended Sections

A well-formed implementation plan SHOULD also contain:

1. **Design or Implementation Section**: One of these headings:

   - `## Design`
   - `## Implementation`
   - `## Approach`
   - `## Overview`

2. **Background or Context**: Explain why the task exists:
   - `## Background`
   - `## Context`
   - `## Problem`

## Software vs General Task Differences

### Software Tasks

Software implementation plans have additional expectations:

- **File Path References**: SHOULD reference specific files to modify
  - Example: `libs-server/entity/storage.mjs`
  - Example: `client/views/components/TaskList.js`
- **Code Changes**: Tasks SHOULD describe specific code modifications
- **Testing**: SHOULD include testing or verification tasks
- **Repository Context**: Tags typically map to repositories

### General Tasks

General (non-software) implementation plans:

- MAY NOT reference file paths
- Focus on actions, decisions, or processes
- May involve external systems or physical activities
- Testing may be manual verification

### Type Identification

Identify task type by:

1. **Tag-based**: Tags like `base-project`, `league-xo-football` suggest software tasks
2. **Directory-based**: Tasks in `task/base/`, `task/league/` are likely software tasks
3. **Content-based**: References to code, files, APIs indicate software tasks

## Examples

### Valid Software Implementation Plan

```markdown
## Background

The entity list API needs pagination support for large result sets.

## Design

Add `limit` and `offset` parameters to the API endpoint.
Implement cursor-based pagination for efficiency.

## Tasks

- [ ] Add pagination parameters to `libs-server/routes/entity-list.mjs`
- [ ] Update query builder in `libs-server/entity/query.mjs`
- [ ] Add pagination response metadata
- [ ] Update API documentation
- [ ] Add integration tests
```

### Valid General Implementation Plan

```markdown
## Background

Need to establish weekly review process for draft tasks.

## Design

Schedule recurring calendar event.
Use manage-task-drafts workflow for systematic review.

## Tasks

- [ ] Create calendar event for weekly review
- [ ] Document review process in runbook
- [ ] Set up notification reminders
```

### Invalid Plan (Missing Tasks)

```markdown
## Overview

We should improve the search functionality to be faster
and more accurate. This will require database optimization
and possibly adding an index.
```

This is invalid because:

- No Tasks section
- No checkbox items
- No actionable items defined
