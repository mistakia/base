---
title: 'Implement Software Task Workflow'
type: 'workflow'
description: |
  Step-by-step workflow for implementing software tasks with proper worktree setup,
  development practices, and quality assurance
created_at: '2025-06-09T03:30:00.000Z'
entity_id: 'b2c3d4e5-6f78-9012-cdef-123456789abc'
guidelines:
  - 'sys:system/guideline/implement-software-task.md'
  - 'sys:system/guideline/write-software-tests.md'
  - 'sys:system/guideline/write-javascript.md'
  - 'sys:system/guideline/write-software-implementation-plan.md'
prompt_properties:
  - name: workflow_example
    type: object
    required: false
    description: Example workflow data to populate templates and examples
    default:
      org: 'mistakia'
      repo: 'base'
      issue_number: '16'
      task_name: 'modify-thread-creation'
      short_description: 'no-auto-change-requests'
      branch_name: 'fix/16-no-auto-change-requests'
      worktree_path: '../repo-worktrees/fix-16-no-auto-change-requests'
      main_file: 'libs-server/threads/create-thread.mjs'
      test_component: 'threads'
      test_file: 'create-thread-test.mjs'
      integration_test: 'change-requests.test.mjs'
      documentation_file: 'execution-threads.md'
      commit_type: 'fix'
      commit_summary: 'modify thread creation to not automatically generate change requests'
      commit_details:
        - 'Remove automatic change request creation from thread creation'
        - 'Add optional create_change_request parameter for explicit control'
        - 'Update documentation to reflect the behavioral change'
        - 'Add comprehensive tests for the new behavior'
        - 'Update existing tests to explicitly request change requests when needed'
      commit_description: "The thread creation workflow now only creates change requests when explicitly requested via the create_change_request parameter, preventing unnecessary file creation for threads that don't require change tracking."
relations:
  - 'implements [[sys:system/guideline/implement-software-task.md]]'
  - 'uses [[sys:system/guideline/write-workflow.md]]'
  - 'uses [[sys:system/guideline/write-software-implementation-plan.md]]'
updated_at: '2025-06-09T03:30:00.000Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Implement Software Task Workflow

## Objective

Implement a software task following established development practices, comprehensive testing, and quality assurance standards.

## Prerequisites

- Access to the target repository
- Understanding of the codebase structure
- Development environment set up (Node.js, Yarn, etc.)
- Familiarity with [[sys:system/guideline/implement-software-task.md]]
- Familiarity with [[sys:system/guideline/write-software-implementation-plan.md]]

## Workflow Steps

### Phase 1: Task Analysis and Setup

#### 1.1 Read and Analyze Task

```bash
# Navigate to task file and read requirements
Read task/github/{{ workflow_example.org }}/{{ workflow_example.repo }}/{{ workflow_example.issue_number }}-{{ workflow_example.task_name }}.md

# Document findings:
# - Current behavior to be changed
# - Expected new behavior
# - Technical context and constraints
# - Affected systems and files
```

#### 1.2 Set Up Worktree and Branch

```bash
# Navigate to main repository
cd /path/to/repository

# Verify clean state on main/master
git status
git branch --show-current

# Create worktree following naming conventions
git worktree add -b {{ workflow_example.branch_name }} {{ workflow_example.worktree_path }}

# Navigate to worktree and setup
cd {{ workflow_example.worktree_path }}
yarn install
```

#### 1.3 Explore Codebase

```bash
# Search for relevant patterns
Grep "pattern related to task" --include="*.mjs"

# Find related files
Glob "**/*{keyword}*.mjs"

# Read key implementation files
Read path/to/relevant/file.mjs
```

### Phase 2: Development and Testing

#### 2.1 Create Initial Test

```bash
# Create test file to document current behavior
Write tests/unit/{{ workflow_example.test_component }}/{{ workflow_example.test_file }}

# Verify current behavior
yarn test:file ./tests/unit/{{ workflow_example.test_component }}/{{ workflow_example.test_file }}
```

#### 2.2 Implement Core Changes

```bash
# Make primary implementation changes
Edit {{ workflow_example.main_file }}

# Update related components
Edit related/files.mjs

# Clean up unused code
Edit files/with/unused/imports.mjs
```

#### 2.3 Update Tests for New Behavior

```bash
# Update tests to expect new behavior
Edit tests/unit/{{ workflow_example.test_component }}/{{ workflow_example.test_file }}

# Verify implementation
yarn test:file ./tests/unit/{{ workflow_example.test_component }}/{{ workflow_example.test_file }}

# Run broader test suite
yarn test:unit --reporter min
```

#### 2.4 Handle Integration Tests

```bash
# Check for affected integration tests
yarn test:integration --reporter min

# Update integration tests as needed
Edit tests/integration/api/{{ workflow_example.integration_test }}

# Update test utilities if needed
Edit tests/utils/test-helpers.mjs
```

### Phase 3: Documentation and Quality

#### 3.1 Update System Documentation

```bash
# Update relevant documentation
Edit system/text/{{ workflow_example.documentation_file }}

# Update API documentation for interface changes
Edit system/schema/related-schema.md

# Update workflow documentation for process changes
Edit system/workflow/related-workflow.md
```

#### 3.2 Run Quality Checks

```bash
# Execute comprehensive test suite
yarn test:unit --reporter min
yarn test:integration --reporter min

# Verify code quality standards
yarn lint

# Run type checking if applicable
yarn typecheck
```

### Phase 4: Finalization

#### 4.1 Final Validation

```bash
# Run complete test suite
yarn test:all --reporter min

# Manual verification of edge cases
# Test specific functionality end-to-end

# Review all changes
git diff --name-only
git status
```

#### 4.2 Commit Changes

```bash
# Stage all changes
git add .

# Create commit following conventional commit format
git commit -m "{{ workflow_example.commit_type }}: {{ workflow_example.commit_summary }}

{% for detail in workflow_example.commit_details %}
- {{ detail }}
{% endfor %}

{{ workflow_example.commit_description }}"
```

## Process Checkpoints

### Phase 1 Complete

- [ ] Task requirements documented and understood
- [ ] Worktree and branch properly configured
- [ ] Codebase exploration completed
- [ ] Dependencies installed and verified

### Phase 2 Complete

- [ ] Initial tests created and passing
- [ ] Core implementation completed
- [ ] Tests updated for new behavior
- [ ] Integration tests addressed

### Phase 3 Complete

- [ ] Documentation updated
- [ ] Quality checks passing
- [ ] Code standards verified

### Phase 4 Complete

- [ ] Final validation successful
- [ ] Changes committed with proper message
- [ ] Implementation ready for review

## Success Criteria

- Implementation addresses the original software task requirements
- All tests pass and quality gates are met
- Documentation accurately reflects changes
- Code follows established patterns and standards
- Commit history is clean and descriptive

## Example Output

For a software task to modify thread creation behavior:

**Process Flow:**

1. Analyzed task requirements from `task/github/{{ workflow_example.org }}/{{ workflow_example.repo }}/{{ workflow_example.issue_number }}-{{ workflow_example.task_name }}.md`
2. Created worktree `{{ workflow_example.branch_name }}`
3. Implemented changes in `{{ workflow_example.main_file }}`
4. Updated tests and documentation
5. Verified quality standards and committed changes

**Deliverables:**

- Modified core implementation files
- Updated test suites (unit and integration)
- Updated system documentation
- Clean commit with descriptive message
