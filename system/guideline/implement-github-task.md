---
title: 'Implement GitHub Task'
type: 'guideline'
description: |
  Guidelines for implementing GitHub tasks with proper worktree setup, development workflow, 
  and code quality practices
created_at: '2025-06-09T03:30:00.000Z'
entity_id: 'a1b2c3d4-5e6f-7890-abcd-ef1234567890'
globs:
  - 'task/github/**/*.md'
guideline_status: 'Approved'
observations:
  - '[workflow] Isolated worktrees prevent conflicts with main development branch'
  - '[quality] Comprehensive testing ensures behavioral correctness'
  - '[documentation] Clear commit messages improve project history'
relations:
  - 'related_to [[sys:guideline/write-workflow.md]]'
  - 'implements [[sys:text/system-design.md]]'
tags:
  - development
  - github
  - workflow
  - testing
updated_at: '2025-06-09T03:30:00.000Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Implement GitHub Task

## Guidelines

### Task Setup and Preparation

- Tasks MUST be read and understood fully before beginning implementation
- Requirements MUST be identified from the task description, including:
  - Current behavior that needs to be changed
  - Expected behavior after implementation
  - Technical constraints and context
- Related files and systems MUST be identified through codebase exploration

### Worktree and Branch Setup

- A dedicated worktree MUST be created for each GitHub task to isolate changes
- Branch naming MUST follow the pattern: `fix/{issue-number}-{short-description}`
  - Example: `fix/16-no-auto-change-requests`
- Worktree creation MUST follow this process:
  1. Navigate to the main repository directory
  2. Create worktree with: `git worktree add -b {branch-name} ../{repo-name}-worktrees/{branch-name}`
  3. Navigate to the new worktree directory
  4. Install dependencies if needed: `yarn install`

### Development Process

- Changes MUST be implemented incrementally with frequent testing
- Implementation MUST address the root cause, not just symptoms
- Backward compatibility SHOULD be maintained unless explicitly breaking changes are required
- Configuration options SHOULD be provided when removing automatic behaviors

### Testing Strategy

- Existing tests MUST be reviewed to understand current behavior expectations
- New tests MUST be written to verify the changed behavior
- All existing tests MUST continue to pass unless they test the deprecated behavior
- Tests MUST be run frequently during development: `yarn test:unit`, `yarn test:integration`
- Specific test commands SHOULD be used for targeted testing: `yarn test:file {test-file}`

### Documentation Updates

- System documentation MUST be updated to reflect behavioral changes
- API documentation MUST be updated for any parameter or interface changes
- Code comments SHOULD be updated to reflect new behavior
- Examples and usage patterns MUST be updated where applicable

### Code Quality

- All linting rules MUST pass: `yarn lint`
- Type checking MUST pass if applicable: `yarn typecheck`
- Code style MUST be consistent with existing codebase conventions
- Unused imports and variables MUST be removed
- Functions SHOULD have clear, descriptive names

### Commit and Review Process

- Changes MUST be committed with descriptive commit messages following conventional commit format
- Commit messages MUST:
  - Include type prefix (fix:, feat:, docs:, etc.)
  - Describe what was changed and why
  - Include technical details in the body if complex
  - NOT include co-author attribution unless specifically requested
- All changes MUST be staged and committed before requesting review

### Implementation Validation

- The implementation MUST solve the original problem described in the task
- Edge cases MUST be considered and tested
- Performance impact MUST be evaluated for significant changes
- Security implications MUST be considered for any authentication or data handling changes

## Example Implementation Process

### 1. Task Analysis
```bash
# Read and understand the task
cat task/github/mistakia/base/16-modify-thread-creation.md

# Identify key requirements:
# - Remove automatic change request creation
# - Add explicit control parameter
# - Update tests and documentation
```

### 2. Worktree Setup
```bash
# Navigate to repository
cd /path/to/repository

# Create worktree and branch
git worktree add -b fix/16-no-auto-change-requests ../repo-worktrees/fix-16-no-auto-change-requests

# Navigate and setup
cd ../repo-worktrees/fix-16-no-auto-change-requests
yarn install
```

### 3. Development Cycle
```bash
# Make changes to core functionality
# Update libs-server/threads/create-thread.mjs

# Test changes
yarn test:file ./tests/unit/threads/create-thread.test.mjs

# Update related tests
# Fix integration tests that depend on old behavior

# Run comprehensive tests
yarn test:unit --reporter min
yarn test:integration --reporter min
```

### 4. Documentation Updates
```bash
# Update system documentation
# Edit system/text/execution-threads.md

# Verify documentation accuracy
# Review all references to changed behavior
```

### 5. Final Validation
```bash
# Run full test suite
yarn test:all --reporter min

# Check code quality
yarn lint

# Commit changes
git add .
git commit -m "fix: modify thread creation to not automatically generate change requests

- Remove automatic change request creation from thread creation
- Add optional create_change_request parameter for explicit control
- Update documentation to reflect the behavioral change
- Add comprehensive tests for the new behavior
- Update existing tests to explicitly request change requests when needed

The thread creation workflow now only creates change requests when
explicitly requested via the create_change_request parameter, preventing
unnecessary file creation for threads that don't require change tracking."
```

## Common Pitfalls to Avoid

- DO NOT modify tests without understanding why they were written
- DO NOT break existing functionality without explicit requirements
- DO NOT commit without running tests
- DO NOT ignore linting errors
- DO NOT make changes outside the scope of the task
- DO NOT include debug code or temporary changes in commits