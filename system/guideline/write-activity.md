---
title: Create Activity Guideline
type: guideline
description: Guidelines for creating new activities
globs: [system/activity/*.md, user/activity/*.md]
guideline_status: Approved
activities: []
tags: []
observations:
  - '[governance] Proper activity location ensures system organization #structure'
  - '[principle] Clear naming conventions improve discoverability #naming'
  - '[organization] System vs user classification is based on scope of use #categorization'
relations:
  - 'implements [[system/text/system-design.md]]'
---

# Create Activity Guideline

## Guidelines

- Determine if the activity is a new system activity or a new user activity. System activities MUST be stored in `system/activity/` and user activities MUST be stored in `user/activity/`.
- Activities MUST be named like `activity-name.md`.
- Activities that are generic and would be used by every single user are considered system activities.
- Activities that may be used by some users but not others are considered user activities.
