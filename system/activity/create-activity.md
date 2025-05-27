---
title: 'Create Activity'
type: 'activity'
description: |
  Process for creating a new activity
created_at: '2025-05-27T18:10:20.225Z'
entity_id: 'd10f13a7-b037-4f90-9f05-73c3294c0243'
guidelines:
  - 'system/write-activity.md'
observations:
  - '[workflow] Creating activities is a fundamental system operation #core'
  - '[organization] Activities must be properly categorized as system or user #structure'
  - '[governance] Each activity should follow established guidelines #compliance'
relations:
  - 'follows [[system/guideline/write-activity.md]]'
  - 'implements [[system/text/system-design.md]]'
tags:
updated_at: '2025-05-27T18:10:20.225Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Create Activity

This activity defines the process for creating new activities in the system.

## Process

1. Determine if the activity should be a system or user activity
2. Create the activity file with proper frontmatter
3. Define the activity description and related guidelines
4. Save the file in the appropriate directory
