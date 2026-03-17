---
title: Write Software Implementation Plan
type: workflow
description: >-
  Write implementation plans for software tasks by understanding requirements, analyzing codebase,
  and planning changes
base_uri: sys:system/workflow/write-software-implementation-plan.md
created_at: '2025-06-18T00:44:36.058Z'
entity_id: 2928d808-7e56-42aa-a888-8626046b35e8
public_read: true
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-software-implementation-plan.md]]
  - calls [[sys:system/workflow/write-task.md]]
updated_at: '2026-02-14T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:42:40.148Z'
---

<task>Write a software implementation plan by analyzing a task and breaking it into specific file changes</task>

<context>
Create structured implementation plans by understanding requirements, analyzing codebase, and planning changes. This is done in three phases: research, design, and task planning. Each phase requires explicit user confirmation before proceeding to the next.
</context>

<instructions>
## Important: Phase Progression

- **DO NOT** move to the next phase until the user explicitly confirms they are ready
- Users may iterate on each phase as long as needed
- Wait for explicit statements like "proceed to design phase" or "let's move to task planning"
- Each phase builds on the previous one but can be refined based on feedback

## Phase 1: Research and Information Gathering

1. **Use sub-agents to research the codebase**:
   - Launch a general-purpose agent to:
     - Search for existing code related to the task
     - Identify current patterns and conventions
     - Find relevant configuration and documentation
     - Locate similar implementations or related functionality
2. **Gather information from the user**:

   - Ask clarifying questions about requirements
   - Understand the problem being solved
   - Clarify any ambiguous instructions
   - Confirm understanding of expected outcomes

3. **Create initial plan outline**:

   - Write only the following sections:
     - **Overview**: High-level goals and expected outcomes
     - **Background**: Summary of research findings
     - **Notes**: Initial thoughts and considerations
   - Do not include Design or Tasks sections yet

4. **Stop for review**:
   - Present the research findings to the user
   - Ask if they want to refine or expand the research
   - Wait for explicit confirmation to proceed to Phase 2
   - Iterate on this phase as much as needed

## Phase 2: Design

5. **Only after user confirms Phase 1**:

   - Create the **Design** section:
     - Describe the high-level approach
     - Outline proposed file organization
     - Identify key components and their relationships
     - Note new dependencies or configuration needs
     - Explain integration points with existing code

6. **Stop for design review**:
   - Present the design to the user
   - Ask for feedback on the proposed approach
   - Refine the design based on feedback
   - Wait for explicit confirmation to proceed to Phase 3
   - Iterate on this phase as much as needed

## Phase 3: Task Planning

7. **Only after user confirms Phase 2**:

   - Create detailed tasks:
     - List all files that need changes
     - Describe specific modifications required
     - Explain the purpose of each change
     - Order tasks for logical implementation

8. **Follow the guideline**:

   - Read and Use the template from [[sys:system/guideline/write-software-implementation-plan.md]]
   - Ensure all sections are complete
   - Review for clarity and completeness

9. **Final review**:

   - Present the complete plan to the user
   - Make any final adjustments based on feedback

10. **Save the implementation plan**:

- If a task entity is known:
  - During phases 1-3, propose content for each section but do NOT update the entity file
  - Present proposed sections to the user for review at each phase checkpoint
  - Only update the task entity file at the very end, after the user confirms the final plan
- If no task entity is known:
  - Follow **Step 2** (Task Entity Setup) from [[sys:system/workflow/write-task.md]] for schema reading, folder placement, and tag selection
  - **Before creating, verify the target path does not already exist** (check the filesystem or use `base entity get`). If a file exists at the intended path, choose a different filename to avoid overwriting existing work.
  - Create the entity using `base entity create` CLI (via Bash tool)
  - Include the full implementation plan in the `entity_content` field

11. **Record completion observation**:

- Add an observation to the task entity frontmatter:
  ```yaml
  observations:
    - '[plan-completed] <date>'
  ```
  Where `<date>` is the current date in YYYY-MM-DD format.
- Update the `updated_at` timestamp.

</instructions>

<output_format>
After writing and saving the implementation plan, display:

**Implementation Plan Created**

Path: [base_uri of the updated task or created task entity]

Title: [title of the entity]

Description: [brief description of what the plan covers]
</output_format>
