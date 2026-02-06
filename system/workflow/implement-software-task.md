---
title: Implement Software Task Workflow
type: workflow
description: Execute software implementation by setting up work environment and following implementation plans
base_uri: sys:system/workflow/implement-software-task.md
created_at: '2025-06-09T03:30:00.000Z'
entity_id: 10368602-286c-4784-a8e6-a3c1cf256afc
guidelines:
  - sys:system/guideline/implement-software-task.md
  - sys:system/guideline/write-software-tests.md
  - sys:system/guideline/write-javascript.md
  - user:guideline/write-software.md
prompt_properties:
  - name: auto_mode
    type: boolean
    required: false
    description: When true, continue through all tasks without stopping for review. Only stops on errors or plan drift.
    default: false
  - name: workflow_example
    type: object
    required: false
    description: Example workflow data to populate templates and examples
    default:
      org: mistakia
      repo: base
      issue_number: '16'
      task_name: modify-thread-creation
      short_description: no-auto-change-requests
      branch_name: fix/16-no-auto-change-requests
      worktree_path: ../base-worktrees/fix-16-no-auto-change-requests
relations:
  - implements [[sys:system/guideline/implement-software-task.md]]
  - uses [[sys:system/guideline/write-workflow.md]]
  - follows [[sys:system/workflow/write-software-implementation-plan.md]]
  - follows [[sys:system/guideline/review-task.md]]
  - uses [[user:guideline/write-software.md]]
  - uses [[sys:system/guideline/write-javascript.md]]
  - precedes [[sys:system/workflow/merge-worktree.md]]
updated_at: '2026-01-19T00:00:00.000Z'
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

2. **Update Plan Status**

   - If the implementation plan status is not already "In Progress", update it to "In Progress"
   - If `started_at` is not already set, update it to current ISO 8601 timestamp
   - This signals that active work has begun on the implementation

3. **Set Up Work Environment**
   - Navigate to the target repository (not user-base)
   - Verify clean state on main/master branch
   - Create worktree using pattern: `git worktree add -b {branch-name} ../{repo-name}-worktrees/{branch-name}`
   - Navigate to worktree directory
   - **Path reference**: From within the worktree, the main repo is at `../../{repo-name}` (e.g., `../../base`)
   - **Copy config files from main repository** (required for scripts and testing):
     - Config files are typically gitignored and must be copied manually to the worktree
     - Common patterns to copy (check .gitignore for project-specific patterns):
       - Root config files: `cp ../../{repo-name}/config.*.js .` (e.g., config.production.js, config.development.js)
       - Config directory: `cp ../../{repo-name}/config/config*.json ./config/` (e.g., config.json)
     - Do NOT read config file contents to avoid exposing sensitive information
   - **Initialize submodules (if modifying submodule code)**:
     - Initialize needed submodule: `git submodule update --init [submodule-path]`
     - Checkout proper branch (submodules start in detached HEAD): `cd [submodule-path] && git checkout main && cd ..`
   - **Install dependencies** (choose based on native module complexity):
     - **Fast path** (for projects with native dependencies like duckdb, kuzu, sqlite3):
       - Copy node_modules from main repo: `cp -r ../../{repo-name}/node_modules .`
       - Run `yarn install` to verify and link (typically < 1 second)
     - **Standard path**: `yarn install`
       - With `enableGlobalCache: true` and `nmMode: hardlinks-global`, JS packages are fetched instantly via hardlinks
       - Native modules still rebuild per-worktree (build artifacts are project-local, not globally cached)
   - Document working directory path

## Phase 2: Implementation (Single Task Focus)

4. **Execute Current Task**

   - Select the first uncompleted task from the implementation plan
   - Read and follow [[user:guideline/write-software.md]] for variable naming and DRY principles
   - Read and follow [[sys:system/guideline/write-javascript.md]] for JavaScript-specific practices (ES modules, function parameters, etc.)
   - Make the required changes for that task only
   - Mark the task as "Completed" in the implementation plan using checkbox format: `- [x]`

5. **Handle Implementation Plan Changes**

   - If during implementation you discover the plan needs changes (drift detected):
     - STOP implementation immediately
     - Present the proposed changes and reasoning for review
     - Wait for explicit approval before updating the plan
     - Only continue after plan changes are approved

6. **Report and Continue/Pause**
   - Update the implementation plan with task completion progress and git worktree absolute path
   - Present what was completed and current plan status
   - Identify the next uncompleted task
   - **If auto_mode is false** (default): STOP and wait for explicit instruction to proceed
   - **If auto_mode is true**: Continue to next task automatically (loop back to step 4)
     - Still STOP on: errors, plan drift, test failures, or ambiguous situations

## Phase 3: Quality Assurance (Final Phase Only)

7. **Complete Testing and Review** (only when ALL tasks are finished)
   - Run full test suite: `yarn test:unit --reporter min` and `yarn test:integration --reporter min`
   - Run code quality checks: `yarn lint` and `yarn typecheck` if available
   - Review all changes: `git diff --name-only` and `git status`
   - Update implementation plan status to "Completed"
   - Update `finished_at` to current ISO 8601 timestamp
   - **DO NOT commit any code** - committing is handled by [[sys:system/workflow/merge-worktree.md]]

## Critical Rules

- **Single Task Focus**: Work on ONE task at a time from the implementation plan
- **Progress Tracking**: ALWAYS update the implementation plan with progress and git worktree absolute path after each task completion
- **Plan Drift Control**: If plan changes are needed, STOP and get approval before updating (even in auto_mode)
- **Review Gates**: STOP after each task for review unless auto_mode is true or explicitly told to continue with all remaining tasks
- **Auto Mode Stops**: Even in auto_mode, ALWAYS stop on errors, plan drift, test failures, or ambiguous situations
- **Environment Management**: Use the worktree setup pattern and document working directory
- **Quality Gates**: Run tests and quality checks only when ALL tasks are complete
- **No Commits**: DO NOT commit any code during implementation - all commits are handled by [[sys:system/workflow/merge-worktree.md]]
- **Submodule Management**:
  - Initialize only needed submodules with `git submodule update --init [submodule-path]`
  - Ensure submodules are on proper branches (not detached HEAD) before making changes
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

**If auto_mode is false:**
Ready for review. Please confirm to proceed with next task or specify "continue with all remaining tasks"

**If auto_mode is true:**
Continuing to next task... (or "Stopping: [reason]" if error/drift/ambiguity detected)
</output_format>
