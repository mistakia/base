---
title: Write JavaScript
type: guideline
description: Guidelines for writing JavaScript/ECMAScript code
base_uri: sys:system/guideline/write-javascript.md
created_at: '2025-05-27T18:10:20.240Z'
entity_id: 1d8b6928-ca52-4eb0-bda2-a6bc23bf1a5b
globs:
  - '**/*.mjs'
  - '**/*.js'
observations:
  - '[standard] Consistent module imports improve code maintainability'
  - '[quality] Explicit file extensions prevent import resolution issues'
  - '[architecture] Named alias imports (#) eliminate fragile relative paths'
  - '[architecture] Functional paradigms promote immutability and testability'
  - '[readability] Named parameters improve code clarity and maintainability'
  - '[maintainability] Smaller files are easier to understand and maintain'
public_read: true
relations:
  - implements [[sys:system/text/system-design.md]]
updated_at: '2026-04-06T12:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:31:44.217Z'
---

# JavaScript ES Module Imports

- ES modules MUST include the `.mjs` extension when importing other local modules
- The `.mjs` extension MUST be explicit in all import statements to prevent module resolution issues
- When importing from an index file, use the directory path with the index.mjs extension explicitly
- Separate global libraries from project-specific imports with a blank line
- Use consistent ordering: external libraries first, then project modules

## Import Path Rules

- **Always use `#` named aliases** (Node.js `package.json` `imports` field) when the project defines them. Named aliases are canonical, refactor-safe, and immediately communicate which package a module belongs to.
- **Never use `../` to traverse up directories.** Parent-relative imports are fragile, obscure the package boundary, and break when files move. If a `#` alias exists for the target, use it.
- **`./` relative imports within the same directory are acceptable** for sibling modules that share a common concern and are unlikely to be referenced from elsewhere.
- When a needed alias does not exist, add it to `package.json` `imports` rather than resorting to `../` paths.

### Examples

  ```js
  // Correct - named alias imports
  import create_tag from '#libs-server/tags/create-tag.mjs'
  import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'
  import config from '#config'
  import db from '#db'

  // Correct - same-directory relative import
  import { helper } from './helper.mjs'

  // Incorrect - parent-relative import (use # alias instead)
  import create_tag from '../../libs-server/tags/create-tag.mjs'
  import config from '../config/index.mjs'
  import db from '../db/index.mjs'

  // Incorrect - missing .mjs extension
  import { function_name } from './module-name'
  import function_name from '#libs-server/module'
  ```

  ```js
  // Import ordering: external libraries first, then project aliases
  import { expect } from 'chai'
  import express from 'express'

  import create_tag from '#libs-server/tags/create-tag.mjs'
  import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'
  ```

## Namespaces and Organization

- Use the appropriate namespace prefix for different parts of the application. Each project defines its own aliases in `package.json` `imports`. Common aliases:
  - `#server` - Server components
  - `#libs-server` - Server-side library functions
  - `#libs-shared` - Shared library functions
  - `#tests` / `#test` - Test utilities
  - `#config` - Configuration modules
  - `#db` - Database access
  - `#root` - Root-level resources
  - `#scripts` - Script utilities

See each project's `package.json` `imports` field for the complete list of available aliases.

## File Organization

- Files SHOULD have a soft limit of 200 lines
- Reusable functions SHOULD be placed in their own files
- Functions that are only used in one place SHOULD be defined in the file where they are used
- When extracting functions to their own files, follow the naming conventions and namespace organization described above
- Avoid barrel files (index.mjs files that only re-export from other modules). Import directly from the source module instead. Index files SHOULD only be used when they define shared utilities or contain actual logic, not as re-export aggregators.

## Functional vs Object-Oriented Programming

- Functions SHOULD be preferred over classes in most scenarios
- Classes SHOULD only be used when:
  - Inheritance provides clear organizational and simplification benefits
  - Complex state management would be simplified through encapsulation
- Pure functions SHOULD be used wherever possible to minimize side effects
- Higher-order functions SHOULD be used to enhance code reusability

## Function Parameters

- Functions with multiple parameters MUST use named parameters (object destructuring)
- Functions with a single parameter MAY use positional arguments
- Named parameters SHOULD have default values when appropriate
- Do not use emojis in JavaScript code
