---
title: Write Software
type: guideline
description: Guidelines for writing software with focus on variable naming conventions
base_uri: sys:system/guideline/write-software.md
created_at: '2025-08-16T17:56:07.644Z'
entity_id: f667d30d-b928-4ab5-9f6a-a32ce09c42a0
globs:
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.ts'
  - '**/*.py'
  - '**/*.rb'
  - '**/*.go'
observations:
  - '[searchability] Descriptive names improve software discovery through grep/search'
  - '[maintainability] Consistent naming reduces cognitive load'
  - '[uniqueness] Globally unique names prevent naming conflicts'
  - '[philosophy] Start with core beliefs and iterate based on actual needs'
relations:
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
public_read: true
updated_at: '2025-08-16T18:28:11.394Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Write Software

Follow the [[sys:system/guideline/starting-point-philosophy.md]] when writing software.

## DRY Principle (Don't Repeat Yourself)

- Software MUST NOT be duplicated across the codebase
- Common functionality SHOULD be extracted into reusable functions or modules
- Repeated patterns SHOULD be abstracted into utilities or helpers
- Configuration and constants SHOULD be centralized
- When extracting software, ensure the abstraction is meaningful and reduces complexity

# Variable Naming

## Guidelines

- Variable names MUST be descriptive and self-documenting
- Variable names SHOULD be globally unique within the codebase to enable effective searching
- Variable names SHOULD be easily discoverable through grep and search tools
- Variable names SHOULD include project context to indicate related component or functionality

## Naming Principles

- Use full words instead of abbreviations (`user_count` not `usr_cnt`)
- Include context when needed (`database_connection` not `connection`)
- Choose names that reveal intent (`is_valid` not `flag`)
- Consider searchability when naming (`create_user_account` is more searchable than `create`)
- Include component or domain context (`auth_token`, `payment_processor`, `league_standings`)
- Prefix with module or feature area when helpful (`api_response`, `db_transaction`, `ui_component`)
- Use ALL_CAPS for enums and constants (`USER_STATUS`, `API_ENDPOINTS`, `ERROR_CODES`)
