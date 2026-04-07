---
title: Write General Implementation Plan
type: guideline
description: Guidelines for writing general implementation plans
base_uri: sys:system/guideline/write-general-implementation-plan.md
created_at: '2025-08-16T17:56:08.200Z'
entity_id: 70e29ce5-4339-41a7-98b3-c8e2ce0ea071
public_read: true
relations:
  - related_to [[sys:system/guideline/write-software-implementation-plan.md]]
  - implements [[sys:system/text/system-design.md]]
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
updated_at: '2026-01-05T19:25:17.461Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:31:13.394Z'
---

- List all specific actions that need to be taken, using clear descriptions.
- For each action, clearly describe the specific steps or activities required, without including unnecessary detail.
- Break down the implementation into clear, actionable steps, ensuring each step is concise and unambiguous.
- Use a markdown task list format so that progress can be tracked easily.
- Use markdown checkboxes `- [ ]` for incomplete tasks and `- [x]` for completed tasks.
- **STRICTLY AVOID** emojis in implementation plans - they make plans look unprofessional and add no value.
- Ensure the plan is self-contained and understandable without additional context.
- Use consistent terminology and formatting throughout the plan.
- Review the plan for completeness and accuracy before sharing.
- Include the purpose of each action to provide context.
- **Avoid numbered lists** - use logical groupings, categories, or phases instead of sequential numbering to prevent staleness when plans are modified.
- **Task item structure should be flexible** - allow for varying levels of detail, action descriptions, resource requirements, and implementation notes as appropriate for different types of work.
- **Progress tracking** - all task items must use `- [ ]` checkbox format to enable progress tracking.

## Template

````markdown
# Implementation Plan: [Title]

## Overview

- [High-level goals and purpose of the implementation]
- [Expected outcomes]

## Background

- [Existing processes, documentation, or context related to the task]
- [Current situation and relevant background]
- [Dependencies and integrations]

## Design

- [High-level approach and organization]
- [Proposed structure and workflow]
- [Key components and their relationships]
- [New dependencies or requirements]
- [Integration points with existing systems]

## Notes

- [Notable implementation details]
- [Guidance on approach]
- [Relevant resources and references]
- [Potential challenges and considerations]

## Tasks

### Core Implementation

- [ ] **[Action or deliverable to complete]**
  - Description: [Clear description of what needs to be done]
  - Purpose: [Why this action is needed]
  - Details:
    - [Specific activity 1]
    - [Specific activity 2]

- [ ] **[Alternative format with structured details]**
  - Description: [Clear description of what needs to be done]
  - Purpose: [Why this action is needed]
  - Activities:
  ```
  - Research: topic_or_area
  - Create: deliverable_or_output
  - Update: existing_resource
  - Coordinate: stakeholder_or_process
  ```

### Setup & Preparation

- [ ] **[Preparation activities]**
  - [Setup requirements]
  - [Resource gathering needs]

### Validation & Review

- [ ] **[Review and validation activities]**
  - [Review scenarios to implement]
  - [Validation steps required]
````
