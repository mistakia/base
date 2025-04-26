---
title: Create Activity Guideline
type: guideline
description: Guidelines for creating new activities
globs: [system/activity/*.md, data/activity/*.md]
guideline_status: Approved
activities: [Create Activity]
tags: [activity, creation, governance]
observations:
  - '[governance] Proper activity location ensures system organization #structure'
  - '[principle] Clear naming conventions improve discoverability #naming'
  - '[organization] System vs user classification is based on scope of use #categorization'
relations:
  - 'guides [[system/activity/create-activity]]'
  - 'implements [[system/text/system-design]]'
---

# Create Activity Guideline

## Guidelines

- Determine if the activity is a new system activity or a new user activity. System activities MUST be stored in `system/activity/` and user activities MUST be stored in `data/activity/`.
- Activities MUST be named like `activity-name.md`.
- Activities that are generic and would be used by every single user are considered system activities.
- Activities that may be used by some users but not others are considered user activities.
