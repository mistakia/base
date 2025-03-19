---
title: Create Activity Guideline
type: guideline
description: Guidelines for creating new activities
guideline_status: Approved
activities: [Create Activity]
tags: [activity, creation, governance]
observations:
  - '[governance] Proper activity location ensures system organization #structure'
  - '[principle] Clear naming conventions improve discoverability #naming'
  - '[organization] System vs user classification is based on scope of use #categorization'
relations:
  - 'guides [[Create Activity]]'
  - 'implements [[System Design]]'
---

# Create Activity Guideline

## Guidelines

- Determine if the activity is a new system activity or a new user activity. System activities MUST be stored in `system/activities/` and user activities MUST be stored in `data/activities/`.
- Activities MUST be named like `activity_name.md`.
- Activities that are generic and would be used by every single user are considered system activities.
- Activities that may be used by some users but not others are considered user activities.
