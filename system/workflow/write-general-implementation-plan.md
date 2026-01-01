---
title: Write General Implementation Plan
type: workflow
description: >-
  Write implementation plans for general tasks by understanding requirements, analyzing context, and
  planning actions
created_at: '2025-08-16T17:56:08.207Z'
entity_id: d37369cd-8791-42dd-b696-6f9fc2389fa7
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-general-implementation-plan.md]]
  - creates [[sys:system/schema/task.md]]
  - follows [[sys:system/text/base-uri.md]]
updated_at: '2025-08-16T17:56:09.135Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

<task>Write a general implementation plan by gathering background information, analyzing a task, and breaking it into specific actionable steps</task>

<context>
Create a structured plan by understanding requirements, analyzing context, and planning actions. This is done in three phases: research, design, and task planning. Each phase requires explicit user confirmation before proceeding to the next.
</context>

<instructions>
## Important: Phase Progression

- **DO NOT** move to the next phase until the user explicitly confirms they are ready
- Users may iterate on each phase as long as needed
- Wait for explicit statements like "proceed to design phase" or "let's move to task planning"
- Each phase builds on the previous one but can be refined based on feedback

## Phase 1: Research and Information Gathering

1. **Use sub-agents to research relevant context**:
   - Launch a general-purpose agent to:
     - Search for existing related work or processes
     - Identify current patterns and conventions
     - Find relevant documentation and resources
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
     - Outline proposed organization and structure
     - Identify key components and their relationships
     - Note new dependencies or requirements
     - Explain integration points with existing systems

6. **Stop for design review**:
   - Present the design to the user
   - Ask for feedback on the proposed approach
   - Refine the design based on feedback
   - Wait for explicit confirmation to proceed to Phase 3
   - Iterate on this phase as much as needed

## Phase 3: Task Planning

7. **Only after user confirms Phase 2**:

   - Create detailed tasks:
     - List all specific actions that need to be taken
     - Describe specific activities required
     - Explain the purpose of each action
     - Order tasks for logical implementation

8. **Follow the guideline**:

   - Use the template from [[sys:system/guideline/write-general-implementation-plan.md]]
   - Ensure all sections are complete
   - Review for clarity and completeness

9. **Final review**:

   - Present the complete plan to the user
   - Make any final adjustments based on feedback

10. **Save the implementation plan**:

- If a task entity is known, update the task entity file with the implementation plan
- If no task entity is known:
  - Create a new task entity using `entity_create` tool
  - Use entity type "task" (see [[sys:system/schema/task.md]])
  - Set `title` to the task name and include a brief `description`
  - Initialize relevant fields where useful (e.g., `status: Planned`, `priority: Medium`)
  - Include the full implementation plan in the `entity_content` field
  - Organize the entity under the appropriate subfolder in `task/` (e.g., `task/base/`, `task/league/`, `task/infrastructure/`, `task/github/`). If uncertain, use `task/base/`
  - Check the `tag/` directory for applicable tags and add them to the `tags:` frontmatter field (e.g., `tags: [user:tag/base-project.md]`). Select ONE primary tag for grouping. See [[user:guideline/tag-creation-standards.md]]

</instructions>

<output_format>
After writing and saving the implementation plan, display:

**Implementation Plan Created**

Path: [base_uri of the updated task or created task entity]

Title: [title of the entity]

Description: [brief description of what the plan covers]
</output_format>
