---
title: Write CLI Scripts
type: guideline
description: Guidelines for writing CLI scripts based on existing patterns
globs: [scripts/**/*]
guideline_status: Approved
tags: [scripts, cli, development]
---

# Write CLI Scripts

## Guidelines

### Script Type Selection

- CLI scripts MUST be written using either:
  - Node.js (with `.mjs` extension for ES modules)
  - Bash shell scripts (with `.sh` extension)
- The choice between Node.js and Bash SHOULD be based on:
  - Complexity of the task (use Node.js for more complex operations)
  - Dependencies required (use Node.js when interacting with the application's codebase)
  - Platform compatibility requirements (use Bash for simple system operations)

### Node.js Script Guidelines

#### File Structure and Format

- Node.js CLI scripts MUST use the `.mjs` extension for ES module compatibility
- Node.js CLI scripts SHOULD include a shebang line (`#!/usr/bin/env node`) if directly executable
- Node.js CLI scripts SHOULD define a modular main function with a descriptive name (e.g., `run`, `main`, etc.)
- Node.js CLI scripts SHOULD export the main function as default export if needed elsewhere
- Node.js CLI scripts SHOULD include error handling with try/catch blocks
- Node.js CLI scripts SHOULD check if they are being run directly using the `isMain` utility from `#libs-server`
- Node.js CLI scripts SHOULD explicitly call `process.exit()` after completion

#### Command-Line Arguments

- Node.js CLI scripts that accept arguments SHOULD use the `yargs` package for argument parsing
- Node.js CLI scripts SHOULD use `hideBin` from `yargs/helpers` to process `process.argv`
- Node.js CLI scripts SHOULD include help text and usage examples in the argument configuration
- Node.js CLI scripts SHOULD validate required arguments

#### Logging and Output

- Node.js CLI scripts SHOULD import logging/debugging utilities:
  - SHOULD use the `debug` package for logging
  - SHOULD enable specific debug namespaces (e.g., `debug.enable('script-name')`)
- Node.js CLI scripts SHOULD use consistent logging patterns:
  - Use `debug` for detailed/verbose information
  - Use `console.error` for error messages
- Node.js CLI scripts SHOULD provide clear, informative output on completion or error

### Bash Script Guidelines

#### File Structure and Format

- Bash scripts MUST use the `.sh` extension
- Bash scripts MUST begin with the appropriate shebang line (`#!/bin/bash` or `#!/usr/bin/env bash`)
- Bash scripts MUST have executable permissions (`chmod +x script.sh`)
- Bash scripts SHOULD include a brief comment block at the top describing the script's purpose

#### Command-Line Arguments

- Bash scripts SHOULD validate input arguments at the beginning of the script
- Bash scripts SHOULD include a usage function that displays help information
- Bash scripts SHOULD handle missing required arguments gracefully

#### Error Handling and Output

- Bash scripts SHOULD include error handling with appropriate exit codes
- Bash scripts SHOULD use `echo` for standard output and `echo >&2` for error messages
- Bash scripts SHOULD provide clear, informative output on completion or error
