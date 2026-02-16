---
title: Review Software
type: guideline
description: Guidelines for conducting software reviews with focus on substantive issues and compliance
base_uri: sys:system/guideline/review-software.md
created_at: '2026-01-13T18:51:33.747Z'
entity_id: d6d52ff5-701e-49cb-b1e7-9b22aa279cbb
globs:
  - '**/*.mjs'
  - '**/*.js'
  - '**/*.ts'
  - '**/*.py'
observations:
  - '[quality] Focus on substantive issues that affect functionality'
  - '[efficiency] Avoid flagging issues that linters and compilers catch'
  - '[precision] High confidence issues only - avoid false positives'
  - '[context] Understanding intent and history improves review quality'
public_read: true
relations:
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
  - implements [[sys:system/guideline/write-software.md]]
  - related_to [[sys:system/guideline/simplify-software-implementation.md]]
updated_at: '2026-02-04T00:00:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:28:42.131Z'
---

# Review Software

Follow the [[sys:system/guideline/starting-point-philosophy.md]] when reviewing software.

## Review Philosophy

Software reviews focus on substantive issues that affect functionality, security, and maintainability. Reviews avoid nitpicks and issues that automated tools catch.

## What to Review

### Substantive Issues

- **Logic Errors**: Bugs in business logic or control flow
- **Security Vulnerabilities**: Injection, authentication, authorization issues
- **Data Integrity**: Race conditions, improper state management
- **API Contract Violations**: Breaking changes, incorrect usage patterns
- **Performance Problems**: Inefficiencies, resource misuse, scaling bottlenecks (see Performance Analysis below)

### Compliance Verification

- **CLAUDE.md Compliance**: Changes align with project conventions and instructions
- **Guideline Adherence**: Software follows established guidelines for the project
- **Architectural Consistency**: Changes fit existing patterns and structure
- **Documentation Accuracy**: Comments and docs reflect actual behavior

### Software Quality

- **Simplicity**: Apply [[sys:system/guideline/simplify-software-implementation.md]] principles
- **Readability**: Software is understandable without excessive context
- **Naming Clarity**: Names communicate purpose and distinguish similar components (e.g., `extract_task_from_entity` vs `normalize_task_for_table_response` clarifies query-layer extraction vs presentation-layer normalization)
- **Maintainability**: Future changes will be straightforward
- **Testability**: Software can be reasonably tested

### Performance Analysis

- **Synchronous I/O in async paths**: `readFileSync`, `execSync`, or other blocking calls inside request handlers, event loops, or async functions
- **Unbounded growth**: Maps, arrays, caches, or listeners that grow without eviction or size limits
- **Missing timeouts and abort controllers**: Network requests, database queries, child processes, or stream reads without timeout protection
- **N+1 patterns**: Repeated queries or file reads inside loops where batching is possible
- **Unnecessary recomputation**: Expensive operations repeated on every call, render, or event without memoization or caching
- **Blocking operations**: CPU-intensive work on the main thread without worker offloading
- **Resource leaks**: Unclosed file handles, database connections, stream readers, event listeners, or timers not cleaned up on error paths
- **Missing pagination**: Unbounded result sets from queries, API responses, or directory listings loaded entirely into memory
- **Inefficient data structures**: Linear scans where indexed lookups exist, string concatenation in loops, repeated array-to-Set conversions
- **Client rendering**: Missing memoization on expensive renders, unnecessary re-renders from unstable references, large lists without virtualization

## Production Readiness

### Credential and Secret Scanning

- Real tokens, API keys, and credentials MUST NOT be committed to repositories
- Authentication data MUST be removed from all files before production
- Test files with authentication data MUST be deleted, not just commented out
- Comprehensive credential scanning MUST be performed across the entire codebase

### Development Artifact Cleanup

- Debug scripts and exploration files MUST be removed from production branches
- Temporary test files MUST be cleaned up before code review completion
- Sample data files SHOULD be removed unless specifically needed for documentation
- Files with naming patterns like `debug-*`, `test-*`, `explore-*` require review for necessity

### Duplication Prevention

- Duplicate software MUST be identified and eliminated before completion
- New implementations MUST be checked against existing codebase for overlap
- Similar functionality SHOULD be consolidated into reusable components

## What NOT to Review

### Skip These Issues

- **Linter/Compiler Catches**: Formatting, unused imports, type errors
- **Style Preferences**: Subjective choices within guidelines
- **Pre-existing Issues**: Problems in unchanged software (file separate issues)
- **Nitpicks**: Minor improvements that do not affect functionality
- **Hypothetical Problems**: Issues that require unlikely scenarios

### Scope Boundaries

- Review ONLY modified lines and their immediate context
- Do NOT flag issues in unchanged software unless directly related to changes
- Do NOT suggest improvements beyond the scope of the change
- Do NOT request additional features or refactoring outside scope

## Confidence Scoring

When flagging issues, assess confidence level:

| Score    | Meaning                         | Action              |
| -------- | ------------------------------- | ------------------- |
| 90-100   | Definite bug or clear violation | Must address        |
| 80-89    | Very likely issue               | Should address      |
| 70-79    | Probable issue                  | Consider addressing |
| Below 70 | Uncertain                       | Do not flag         |

Only report issues scoring 80 or above to minimize false positives.

## Review Output Standards

### Issue Format

Each issue MUST include:

- **File and line reference**: `path/to/file.mjs:42`
- **Issue description**: Clear, specific statement of the problem
- **Impact assessment**: Why this matters
- **Confidence score**: Numerical rating 80-100
- **Suggested fix**: Concrete recommendation when applicable

### Documentation Requirements

- Cite specific sources (CLAUDE.md sections, guidelines, documentation)
- Provide full context for understanding the issue
- Link to relevant software using exact line numbers
- Keep commentary concise and actionable

## Review Process

1. **Gather Context**: Collect relevant CLAUDE.md files and guidelines
2. **Understand Changes**: Read the diff to understand what changed and why
3. **Check Compliance**: Verify adherence to documented standards
4. **Scan for Bugs**: Look for logic errors in modified software
5. **Analyze Performance**: Check for inefficiencies, resource leaks, scaling bottlenecks
6. **Evaluate Simplicity**: Check for unnecessary complexity
7. **Score and Filter**: Only report high-confidence issues
8. **Format Output**: Present findings clearly with citations
