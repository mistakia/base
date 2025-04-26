---
title: Create Activity
type: activity
description: Process for creating a new activity
guidelines: [system/create_activity.md]
tags: [activity, creation, workflow]
observations:
  - '[workflow] Creating activities is a fundamental system operation #core'
  - '[organization] Activities must be properly categorized as system or user #structure'
  - '[governance] Each activity should follow established guidelines #compliance'
relations:
  - 'follows [[system/guidelines/create-activity]]'
  - 'implements [[system/text/system-design]]'
---

# Create Activity

This activity defines the process for creating new activities in the system.

## Process

1. Determine if the activity should be a system or user activity
2. Create the activity file with proper frontmatter
3. Define the activity description and related guidelines
4. Save the file in the appropriate directory
