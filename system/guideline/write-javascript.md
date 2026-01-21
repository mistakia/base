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
  - '[architecture] Functional paradigms promote immutability and testability'
  - '[readability] Named parameters improve code clarity and maintainability'
  - '[maintainability] Smaller files are easier to understand and maintain'
relations:
  - implements [[sys:system/text/system-design.md]]
public_read: true
updated_at: '2026-01-05T19:25:18.911Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# JavaScript ES Module Imports

- ES modules MUST include the `.mjs` extension when importing other local modules
- The `.mjs` extension MUST be explicit in all import statements to prevent module resolution issues
- When importing from an index file, use the directory path with the index.mjs extension explicitly
- Use aliased absolute imports for project modules with the appropriate namespace prefix
- Separate global libraries from project-specific imports with a blank line
- Use consistent ordering: external libraries first, then project modules
- Examples:

  ```js
  // Correct
  import { function_name } from './module-name.mjs'
  import function_name from '../path/to/module.mjs'

  // Incorrect
  import { function_name } from './module-name'
  import function_name from '../path/to/module'
  ```

  ```js
  // External libraries
  import { expect } from 'chai'
  import express from 'express'

  // Project imports
  import create_tag from '#libs-server/tags/create-tag.mjs'
  import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'
  ```

  ```js
  // Correct
  import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

  // Incorrect
  import reset_all_tables from '#tests/utils/reset-all-tables'
  import create_test_user from '#tests/utils/create-test-user'
  ```

## Namespaces and Organization

- Use the appropriate namespace prefix for different parts of the application:
  - `#server` - Server components
  - `#libs-server` - Server-side library functions
  - `#libs-shared` - Shared library functions
  - `#tests` - Test utilities
  - `#config` - Configuration modules
  - `#root` - Root-level resources

See `package.json` for the complete list of namespaces.

## File Organization

- Files SHOULD have a soft limit of 200 lines
- Reusable functions SHOULD be placed in their own files
- Functions that are only used in one place SHOULD be defined in the file where they are used
- When extracting functions to their own files, follow the naming conventions and namespace organization described above

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
