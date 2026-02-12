---
title: Write Task
type: guideline
description: Standards for creating task entities
base_uri: sys:system/guideline/write-task.md
created_at: '2025-06-26T01:12:08.170Z'
entity_id: d76a09ed-c569-4727-b7e9-98f9c68fd203
globs:
  - task/**/*.md
observations:
  - '[principle] Clear titles improve task discoverability and understanding'
  - '[standard] Proper frontmatter enables system integration and tracking'
  - '[organization] Relationships connect tasks to broader work context'
relations:
  - implements [[sys:system/schema/task.md]]
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
  - follows [[sys:system/guideline/write-text.md]]
  - relates_to [[sys:system/guideline/choose-task-status.md]]
  - relates_to [[sys:system/guideline/choose-task-priority.md]]
updated_at: '2026-01-05T19:25:18.073Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

## Essential Requirements

- Tasks MUST have descriptive titles that clearly state what needs to be done
- Tasks MUST include proper YAML frontmatter following the task schema
- Tasks SHOULD specify priority when it affects scheduling decisions

## Task Properties

### Finish By Date

- Tasks SHOULD include `finish_by` when they have date-related importance or external deadlines
- Tasks without date components rely primarily on priority for scheduling
- Use ISO 8601 format for dates (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.sssZ)

## Content Structure

- Task content SHOULD be concise but complete
- Use bullet points or numbered lists for multi-step work
- Include context only when necessary for understanding
- Avoid duplicating information between description and content

## Task Relationships

- Use relations to connect tasks to projects, dependencies, and resources
- Link subtasks with `subtask_of` relationship
- Specify dependencies with `blocked_by` or `precedes` as appropriate
- Connect to required items or tools using `needs_item` or `uses_item`

## Naming

- Be specific enough to distinguish from similar tasks
- Avoid generic names like "task" or "todo"
