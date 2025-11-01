---
title: 'Implement Software Task Workflow'
type: 'workflow'
description: |
  Execute software implementation by setting up work environment and following implementation plans
created_at: '2025-06-09T03:30:00.000Z'
entity_id: 'b2c3d4e5-6f78-9012-cdef-123456789abc'
guidelines:
  - 'sys:system/guideline/implement-software-task.md'
  - 'sys:system/guideline/write-software-tests.md'
  - 'sys:system/guideline/write-javascript.md'
  - 'user:guideline/write-software.md'
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
      worktree_path: '../base-worktrees/fix-16-no-auto-change-requests'
relations:
  - 'implements [[sys:system/guideline/implement-software-task.md]]'
  - 'uses [[sys:system/guideline/write-workflow.md]]'
  - 'follows [[sys:system/workflow/write-software-implementation-plan.md]]'
  - 'follows [[sys:system/guideline/review-task.md]]'
  - 'uses [[user:guideline/write-software.md]]'
  - 'uses [[sys:system/guideline/write-javascript.md]]'
updated_at: '2025-07-26T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

<task>Execute a software implementation following an implementation plan</task>

<context>This workflow assumes an implementation plan already exists that identifies what needs to be done. The workflow focuses on setting up the work environment and executing the planned changes step by step. Read and follow [[user:guideline/write-software.md]] for general software development practices and [[sys:system/guideline/write-javascript.md]] for JavaScript-specific guidelines.</context>

<instructions>

Before starting, read [[sys:system/guideline/implement-software-task.md]] and [[sys:system/guideline/review-task.md]].

## Phase 1: Setup

1. **Locate Implementation Plan**

   - Find the implementation plan in the task file or text entity
   - Confirm the plan includes specific file changes and tasks
   - Note the location and format of the implementation plan

2. **Set Up Work Environment**
   - Navigate to the target repository (not user-base)
   - Verify clean state on main/master branch
   - Create worktree using pattern: `git worktree add -b {branch-name} ../{repo-name}-worktrees/{branch-name}`
   - Navigate to worktree directory
   - **Initialize submodules (if repository has submodules)**:
     - Check if repository has submodules: `git submodule status`
     - If submodules exist, initialize them: `git submodule update --init --recursive`
     - Verify submodules are properly initialized: `git submodule status` should show all submodules with commit hashes (no `-` prefix)
     - **Important**: Submodules in worktrees start in detached HEAD state. Before making changes to submodule code, ensure you're on a proper branch:
       - Navigate into submodule: `cd [submodule-path]`
       - Check current state: `git branch --show-current` (empty output = detached HEAD)
       - If detached, checkout proper branch: `git checkout main` (or `master` depending on submodule)
       - Navigate back to worktree root: `cd ..` (adjust path as needed)
   - Install dependencies: `yarn install`
   - Document working directory path

## Phase 2: Implementation (Single Task Focus)

3. **Execute Current Task**

   - Select the first uncompleted task from the implementation plan
   - Read and follow [[user:guideline/write-software.md]] for variable naming and DRY principles
   - Read and follow [[sys:system/guideline/write-javascript.md]] for JavaScript-specific practices (ES modules, function parameters, etc.)
   - Make the required changes for that task only
   - Mark the task as completed in the implementation plan using checkbox format: `- [x]`

4. **Handle Implementation Plan Changes**

   - If during implementation you discover the plan needs changes (drift detected):
     - STOP implementation immediately
     - Present the proposed changes and reasoning for review
     - Wait for explicit approval before updating the plan
     - Only continue after plan changes are approved

5. **Report and Pause**
   - Update the implementation plan with task completion progress and git worktree absolute path
   - Present what was completed and current plan status
   - Identify the next uncompleted task
   - STOP and wait for explicit instruction to proceed

## Phase 3: Quality Assurance (Final Phase Only)

6. **Complete Testing and Review** (only when ALL tasks are finished)
   - Run full test suite: `yarn test:unit --reporter min` and `yarn test:integration --reporter min`
   - Run code quality checks: `yarn lint` and `yarn typecheck` if available
   - Review all changes: `git diff --name-only` and `git status`
   - **Handle submodule changes (if applicable)**:
     - Check submodule status: `git submodule status`
     - If submodules were modified (indicated by `+` prefix in status):
       - For each modified submodule:
         1. Navigate into submodule: `cd [submodule-path]`
         2. Verify on proper branch (not detached HEAD): `git branch --show-current`
         3. If detached HEAD (empty output), checkout branch: `git checkout main` (or appropriate branch)
         4. Stage submodule changes: `git add -A`
         5. Commit with descriptive message: `git commit -m "feat: [describe changes]"`
         6. Push to submodule remote: `git push origin [branch-name]`
         7. Navigate back to worktree root: `cd ..`
       - Stage submodule reference in parent repo: `git add [submodule-path]`
       - Commit submodule reference update in parent: `git commit -m "chore: update [submodule-name] submodule reference"`
     - **Critical**: Submodule changes MUST be committed and pushed before merging the parent repository to avoid losing commits
   - Stage remaining changes in parent repo: `git add .`

## Critical Rules

- **Single Task Focus**: Work on ONE task at a time from the implementation plan
- **Progress Tracking**: ALWAYS update the implementation plan with progress and git worktree absolute path after each task completion
- **Plan Drift Control**: If plan changes are needed, STOP and get approval before updating
- **Review Gates**: STOP after each task for review unless explicitly told to continue with all remaining tasks
- **Environment Management**: Use the worktree setup pattern and document working directory
- **Quality Gates**: Run tests and quality checks only when ALL tasks are complete
- **Submodule Management**:
  - Initialize submodules in worktrees with `git submodule update --init --recursive`
  - Ensure submodules are on proper branches (not detached HEAD) before making changes
  - Commit and push submodule changes BEFORE committing parent repository changes
  - Update parent repository to reference new submodule commits
  </instructions>

<output_format>
After completing each task:

**Task Completed**: [Description of task]

**Changes Made**: [Brief summary of what was changed]

**Files Modified**:

- [List of file paths for edited files]
- [List of file paths for created files]

**Implementation Plan Updated**: [Confirmation that progress was marked with git worktree absolute path and any plan changes made]

**Working Directory**: [Current worktree path]

**Next Task**: [Description of the next uncompleted task from the implementation plan, or "All tasks completed" if finished]

Ready for review. Please confirm to proceed with next task or specify "continue with all remaining tasks"
</output_format>
