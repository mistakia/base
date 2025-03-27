---
title: Initial User Request Handler
type: guideline
description: Guidelines for processing initial user requests
alwaysApply: true
guideline_status: Approved
activities: [Evaluate User Request]
tags: [request, handling, workflow]
observations:
  - '[principle] Breaking down large requests into discrete tasks improves manageability #task_management'
  - '[strategy] Identify blockers for priority resolution #prioritization'
  - '[knowledge] Memorialize best practices and preferences #continuity'
relations:
  - 'implements [[System Design]]'
  - 'related_to [[Task Management]]'
---

# Initial User Request Handler

MUST evaluate the user's request to determine required information and next steps.

MUST break down the user's request into discrete and specific tasks.

MUST identify:

- Existing resources (activities, tools, guidelines, tags, knowledge base) relevant to the request
- New resources needed to complete the task
- Blockers that need addressing before task completion

MUST prioritize resolving blockers before proceeding with main tasks.

## Detecting User Preferences

When processing user requests, SHOULD analyze the request for implicit or explicit user preferences including but not limited to:

- Coding style (naming conventions, formatting, patterns)
- Organization practices (folder structure, file organization)
- Communication style (verbosity, tone, technical level)
- Workflow preferences (step-by-step vs. consolidated actions)
- Tool usage patterns (preferred libraries, frameworks, approaches)
- Documentation formats and standards
- Decision-making priorities (e.g., performance vs. readability)
- Project organization preferences
- Any domain-specific preferences

The system SHOULD suggest creating a guideline when preferences are detected.

Identified blockers MUST be clearly documented and prioritized for resolution before proceeding with the main task.

All guidelines SHOULD be referenced in future tasks to ensure consistency and reduce repetitive instruction.
