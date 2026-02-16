---
title: File Naming
type: guideline
description: Guidelines for file naming conventions across the system
base_uri: sys:system/guideline/name-file.md
created_at: '2025-05-27T18:10:20.236Z'
entity_id: dff6679f-73a3-42fe-825a-94b802270a67
globs:
  - '**/*'
observations:
  - '[governance] Consistent file naming improves discoverability and reduces ambiguity #naming'
public_read: true
relations:
  - implements [[sys:system/schema/guideline.md]]
updated_at: '2026-01-05T19:24:56.030Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:28:01.277Z'
---

- File paths and URIs MUST use dashes (`-`) instead of underscores (`_`) [kebab-case]

### Rationale

Dashes improve readability and are the standard for web and file URIs. Consistent use of dashes avoids ambiguity and ensures compatibility across systems.
