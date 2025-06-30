---
title: Write Software Implementation Plan
type: workflow
description: >-
  Write implementation plans for software tasks by understanding requirements, analyzing codebase,
  and planning changes
created_at: '2025-06-18T00:44:36.058Z'
entity_id: 2928d808-7e56-42aa-a888-8626046b35e8
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-software-implementation-plan.md]]
updated_at: '2025-06-18T00:44:36.062Z'
user_id: 00000000-0000-0000-0000-000000000000
---

<task>Write a software implementation plan by analyzing a task and breaking it into specific file changes</task>

<context>
Create structured implementation plans by understanding requirements, analyzing codebase, and planning changes.
</context>

<instructions>
1. **Understand the task completely**:
   - Ask questions if anything is unclear
   - What problem does this solve?
   - What are the exact requirements?
   - Ask for clarifications if the instructions are broad or vague

2. **Understand the existing codebase**:

   - How is the current system structured?
   - What patterns and conventions are used?
   - Where does this new functionality fit?
   - What existing code can be reused?

3. **Plan the transition**:

   - What's the simplest path from current state to desired state?
   - Which files need to change and how?
   - What's the most sensible order to make changes, consider ease of review?
   - What could break and how to prevent it?

4. **Write the implementation plan**:

   - Follow the guideline template [[sys:system/guideline/write-software-implementation-plan.md]]
   - List all files that need changes
   - Make each task clear and testable

5. **Save the implementation plan**:
   - If a task entity is known, update the task entity file with the implementation plan
   - If no task entity is known:
     - Create a new text entity using `entity_create` tool
     - Use entity type "text"
     - Set title as "Implementation Plan: [Task Name]"
     - Set description as brief summary of what the plan covers
     - Include the full implementation plan in the entity_content field

</instructions>

<output_format>
After writing and saving the implementation plan, display:

**Implementation Plan Created**

Path: [base_uri of the updated task or created text entity]

Title: [title of the entity]

Description: [brief description of what the plan covers]
</output_format>
