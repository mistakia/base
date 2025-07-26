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
   - Use the template from [[sys:system/guideline/write-software-implementation-plan.md]]
   - Ensure all sections are complete
   - Review for clarity and completeness

9. **Final review**:
   - Present the complete plan to the user
   - Make any final adjustments based on feedback

10. **Save the implementation plan**:
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
