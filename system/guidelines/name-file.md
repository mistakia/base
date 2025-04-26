---
title: File Naming
type: guideline
description: Guidelines for file naming conventions across the system
globs: ['**/*']
guideline_status: Approved
tags: [naming, files, convention]
observations:
  - '[governance] Consistent file naming improves discoverability and reduces ambiguity #naming'
relations:
  - 'implements [[system/schema/guideline]]'
---

- File paths and URIs MUST use dashes (`-`) instead of underscores (`_`).

### Rationale

Dashes improve readability and are the standard for web and file URIs. Consistent use of dashes avoids ambiguity and ensures compatibility across systems.
