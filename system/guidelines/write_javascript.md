---
title: Write JavaScript
type: guideline
description: Guidelines for writing JavaScript/ECMAScript code
globs: ['**/*.mjs', '**/*.js']
guideline_status: Approved
tags: [javascript]
observations:
  - '[standard] Consistent module imports improve code maintainability #code-style'
  - '[quality] Explicit file extensions prevent import resolution issues #debugging'
  - '[architecture] Functional paradigms promote immutability and testability #maintainability'
  - '[readability] Named parameters improve code clarity and maintainability #code-style'
relations:
  - 'implements [[System Design]]'
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
  import { function_name } from './module_name.mjs'
  import function_name from '../path/to/module.mjs'

  // Incorrect
  import { function_name } from './module_name'
  import function_name from '../path/to/module'
  ```

  ```js
  // External libraries
  import { expect } from 'chai'
  import express from 'express'

  // Project imports
  import db from '#db'
  import create_tag from '#libs-server/tags/create_tag.mjs'
  import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'
  ```

  ```js
  // Correct
  import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

  // Incorrect
  import reset_all_tables from '#tests/utils/reset_all_tables'
  import create_test_user from '#tests/utils/create_test_user'
  ```

## Namespaces and Organization

- Use the appropriate namespace prefix for different parts of the application:
  - `#server` - Server components
  - `#db` - Database utilities
  - `#libs-server` - Server-side library functions
  - `#libs-shared` - Shared library functions
  - `#tests` - Test utilities
  - `#config` - Configuration modules
  - `#root` - Root-level resources

See `package.json` for the complete list of namespaces.

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
