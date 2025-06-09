---
title: 'Implement GitHub Task Workflow'
type: 'workflow'
description: |
  Step-by-step workflow for implementing GitHub tasks with proper worktree setup,
  development practices, and quality assurance
created_at: '2025-06-09T03:30:00.000Z'
entity_id: 'b2c3d4e5-6f78-9012-cdef-123456789abc'
guidelines:
  - 'sys:guideline/implement-github-task.md'
  - 'sys:guideline/write-software-tests.md'
  - 'sys:guideline/write-javascript.md'
relations:
  - 'implements [[sys:guideline/implement-github-task.md]]'
  - 'uses [[sys:guideline/write-workflow.md]]'
tags:
  - development
  - github
  - workflow
  - implementation
tools:
  - 'bash'
  - 'read'
  - 'edit'
  - 'write'
  - 'grep'
  - 'glob'
updated_at: '2025-06-09T03:30:00.000Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Implement GitHub Task Workflow

## Objective

Implement a GitHub task with proper development practices, comprehensive testing, and quality assurance.

## Prerequisites

- Access to the target repository
- Understanding of the codebase structure
- Development environment set up (Node.js, Yarn, etc.)

## Workflow Steps

### Phase 1: Task Analysis and Setup

#### 1.1 Read and Analyze Task
```bash
# Navigate to task file and read requirements
Read task/github/{org}/{repo}/{issue-number}-{task-name}.md

# Identify:
# - Current behavior to be changed
# - Expected new behavior
# - Technical context and constraints
# - Affected systems and files
```

#### 1.2 Set Up Worktree and Branch

**CRITICAL: Never commit directly to `main` or `master` branches**

```bash
# Navigate to main repository
cd /path/to/repository

# Check current branch and status (MUST be on main/master)
git status
git branch --show-current

# NEVER work directly on main/master branches
# Create worktree with descriptive branch name
git worktree add -b fix/{issue-number}-{short-description} ../repo-worktrees/fix-{issue-number}-{short-description}

# Navigate to worktree
cd ../repo-worktrees/fix-{issue-number}-{short-description}

# Install dependencies
yarn install
```

#### 1.3 Explore Codebase
```bash
# Search for relevant code patterns
Grep "pattern related to task" --include="*.mjs"

# Find related files
Glob "**/*{keyword}*.mjs"

# Read key files to understand current implementation
Read path/to/relevant/file.mjs
```

### Phase 2: Development and Testing

#### 2.1 Create Initial Test
```bash
# Create test file to verify current behavior
Write tests/unit/component/feature-test.mjs

# Run test to confirm current behavior
yarn test:file ./tests/unit/component/feature-test.mjs
```

#### 2.2 Implement Core Changes
```bash
# Make primary code changes
Edit path/to/main/file.mjs

# Update function signatures if needed
Edit related/files.mjs

# Remove unused imports
Edit files/with/unused/imports.mjs
```

#### 2.3 Update Tests for New Behavior
```bash
# Update test to expect new behavior
Edit tests/unit/component/feature-test.mjs

# Run test to verify implementation
yarn test:file ./tests/unit/component/feature-test.mjs

# Fix any failing tests
yarn test:unit --reporter min
```

#### 2.4 Handle Integration Tests
```bash
# Identify integration tests that may be affected
yarn test:integration --reporter min

# Update integration tests if they depended on old behavior
Edit tests/integration/api/related-feature.test.mjs

# Create helper functions for tests if needed
Edit tests/utils/test-helpers.mjs
```

### Phase 3: Documentation and Quality

#### 3.1 Update System Documentation
```bash
# Update relevant documentation files
Edit system/text/related-feature.md

# Update API documentation if interfaces changed
Edit system/schema/related-schema.md

# Update workflow documentation if processes changed
Edit system/workflow/related-workflow.md
```

#### 3.2 Run Quality Checks
```bash
# Run all tests
yarn test:unit --reporter min
yarn test:integration --reporter min

# Check code quality
yarn lint

# Run type checking if applicable
yarn typecheck
```

### Phase 4: Finalization

#### 4.1 Final Validation
```bash
# Run comprehensive test suite
yarn test:all --reporter min

# Verify specific functionality works as expected
# Test edge cases manually if needed

# Review all changes
git diff --name-only
git status
```

#### 4.2 Commit Changes
```bash
# Stage all changes
git add .

# Create descriptive commit message following conventional commits
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

## Quality Gates

### Before Implementation
- [ ] Task requirements fully understood
- [ ] Current behavior documented and tested
- [ ] Worktree and branch properly set up (NEVER on main/master)
- [ ] Dependencies installed and working

### During Development
- [ ] Tests written before making changes
- [ ] Changes implemented incrementally
- [ ] Tests passing after each change
- [ ] Code follows existing patterns and conventions

### Before Commit
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code linting clean
- [ ] Documentation updated
- [ ] Commit message descriptive and accurate

## Success Criteria

- The implemented solution addresses the original problem described in the task
- All existing functionality continues to work (no regressions)
- New functionality is properly tested and documented
- Code quality standards are maintained
- Implementation follows established patterns and conventions

## Example Output

For a task to modify thread creation behavior:

**Files Modified:**
- `libs-server/threads/create-thread.mjs` - Core implementation changes
- `system/text/execution-threads.md` - Documentation updates  
- `tests/unit/threads/create-thread-test.mjs` - New behavior tests
- `tests/integration/api/change-requests.test.mjs` - Updated integration tests
- `tests/utils/create-test-thread.mjs` - Test helper updates

**Tests Added:**
- Test verifying no automatic change request creation
- Test verifying explicit change request creation works
- Test verifying backward compatibility

**Documentation Updated:**
- Removed references to automatic change request creation
- Added documentation for new optional parameter
- Updated process flow descriptions