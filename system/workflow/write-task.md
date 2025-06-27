---
title: Write Task
type: workflow
description: Process for creating well-structured task entities
created_at: '2025-06-26T01:12:24.554Z'
entity_id: 1b971f77-1344-45bf-8119-a277cc618237
observations:
  - '[process] MCP entity creation ensures proper schema compliance'
  - '[pattern] Structured workflow reduces errors and omissions'
relations:
  - follows [[guideline/write-task.md]]
  - implements [[repository/active/mistakia/base/system/schema/task.md]]
  - follows [[repository/active/mistakia/base/system/guideline/write-workflow.md]]
updated_at: '2025-06-26T01:12:24.554Z'
user_id: 00000000-0000-0000-0000-000000000000
---

# Write Task

<task>Create a properly structured task entity using the MCP entity creation tool</task>

<context>
User wants to create a new task. Tasks represent discrete units of work that need to be completed and can be standalone or part of larger projects.
</context>

<instructions>
1. **Gather Requirements**
   - Confirm the task title (descriptive, action-oriented)
   - Determine if priority or deadline is needed
   - Identify any relationships to other entities

2. **Create Entity**

   - Use `mcp__base__entity_create` with base_uri pattern `user:task/task-name.md`
   - Set entity_type to "task"
   - Include complete frontmatter per task schema

3. **Structure Content**

   - Write clear, concise task description
   - Use bullet points for multi-step work
   - Add context only if necessary for completion

4. **Set Relationships**
   - Link to parent tasks, projects, or dependencies
   - Connect required items or tools
   - Specify assignments if applicable
     </instructions>

<output_format>
Create the task entity using the MCP tool and confirm successful creation with the generated entity_id and path.
</output_format>
