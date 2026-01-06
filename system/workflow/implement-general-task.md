---
title: Implement General Task Workflow
type: workflow
description: >-
  Execute general task implementation by following implementation plans and managing work
  environment
base_uri: user:repository/active/base/system/workflow/implement-general-task.md
created_at: '2025-08-23T00:00:00.000Z'
entity_id: c3d4e5f6-7890-4234-abcd-ef0123456789
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - follows [[sys:system/workflow/write-general-implementation-plan.md]]
  - follows [[sys:system/guideline/review-task.md]]
  - uses [[user:guideline/write-text.md]]
updated_at: '2026-01-05T19:25:18.081Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

<task>Execute a general task implementation following an implementation plan</task>

<context>This workflow assumes an implementation plan already exists that identifies what needs to be done. The workflow focuses on setting up the work environment and executing the planned actions step by step. This is designed for general tasks that may not require specialized software development environments.</context>

<instructions>

Before starting, read [[sys:system/guideline/review-task.md]] for task-by-task review standards.

## Setup Phase

1. **Locate Implementation Plan**

   - Find the implementation plan in the task file or text entity
   - Confirm the plan includes specific actions and tasks
   - Note the location and format of the implementation plan

2. **Update Plan Status**

   - If the implementation plan status is not already "In Progress", update it to "In Progress"
   - This signals that active work has begun on the implementation

3. **Prepare Work Environment**
   - Navigate to the appropriate working directory
   - Verify current state and prerequisites
   - Document working directory path
   - Identify required tools or resources

## Execution Phase

4. **Work on First Task Only**

   - Select the first uncompleted task from the implementation plan
   - Make the required changes for that task only
   - Follow any specific guidelines referenced in the task
   - Mark the task as "Completed" in the implementation plan using checkbox format: `- [x]`

5. **Update Implementation Plan**

   - Update the implementation plan with task completion progress
   - If during implementation you discover the plan needs changes (drift detected):
     - STOP implementation immediately
     - Present the proposed changes and reasoning for review
     - Wait for explicit approval before updating the plan
     - Only continue after plan changes are approved

6. **Stop for Review**
   - Do NOT proceed to the next task automatically
   - Present what was completed and current plan status
   - Wait for explicit instruction to proceed with next task or all remaining tasks

## Quality Assurance

7. **When All Tasks Complete** (only after explicit instruction)
   - Review all changes made
   - Verify task completion against original requirements
   - Check for any cleanup or follow-up actions needed
   - Update implementation plan status to "Completed"

## Key Rules

- Work on ONE task at a time from the implementation plan
- ALWAYS update the implementation plan with progress after each task
- If plan changes are needed (drift), STOP and get approval before updating
- STOP after each task for review unless explicitly told to continue with all remaining tasks
- Document working directory and verify before each operation

</instructions>

<output_format>
After completing each task:

**Task Completed**: [Description of task]

**Actions Taken**: [Brief summary of what was done]

**Changes Made**:

- [List of files modified, if applicable]
- [List of items created or updated]

**Implementation Plan Updated**: [Confirmation that progress was marked and any plan changes made]

**Working Directory**: [Current working path]

**Next Step**: Ready for review. Please confirm to proceed with next task or specify "continue with all remaining tasks"
</output_format>
