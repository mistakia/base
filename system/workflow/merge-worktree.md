---
title: Merge Worktree Feature Branch
type: workflow
description: Merge a worktree feature branch into the main branch following proper git workflow, with automatic task completion
created_at: '2025-06-14T17:43:40.946Z'
entity_id: a37c88c1-97d3-483a-b30e-7871c3a243bb
observations:
  - '[workflow] Proper merge process ensures code quality and maintains clean git history'
  - '[principle] All changes must go through proper merge process rather than direct commits to main'
  - '[requirement] Feature branch should be reviewed and ready for merge before using this workflow'
  - '[feature] Automatically completes associated tasks when worktree is successfully merged'
prompt_properties:
  - name: branch_name
    description: Name of the feature branch to merge (optional, defaults to current branch)
    type: string
    required: false
  - name: task_path
    description: Path to task file or worktree directory (optional, used to find and complete associated task)
    type: string
    required: false
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
updated_at: '2025-10-17T19:00:03.000Z'
user_public_key: 0000000000000000000000000000000000000000000000000000000000000000
---

# Merge Worktree Feature Branch

## Overview

This workflow handles the complete process for merging a worktree feature branch into the main branch. The system uses git worktrees to isolate development work, and all changes must go through a proper merge process rather than direct commits to main.

**Important**: This workflow assumes the feature branch has been reviewed and is ready for merge. Never merge unreviewed code directly into main.

## Prerequisites

- Feature branch should be reviewed and ready for merge
- Access to the main repository directory
- Proper git permissions for pushing to main branch

## Workflow Overview

This workflow requires navigation between two directories:

1. **Main Repository**: Where you perform checkout, merge, and push operations
2. **Worktree Directory**: Where the feature branch is active and where you perform the rebase

**Directory Navigation Flow**:

```
Main Repo → (Step 0-4: Setup & update main) →
Worktree → (Step 5: Rebase) →
Main Repo → (Step 6-11: Verify, merge, push, cleanup)
```

## Instructions

### 0. Pre-flight Setup (Execute from main repository directory)

- Navigate to the main repository directory first
- Configure git pull behavior to avoid conflicts: `git config pull.rebase false`
- Detect default branch name: `DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD | cut -d'/' -f4)`
- List all worktrees to identify paths: `git worktree list`
- Verify target worktree exists in the worktree list output
- Store the worktree path for later use

### 1. Determine Branch Name

- If `branch_name` parameter is provided, use it as the branch name
- Otherwise, use the current branch name from the working directory

### 2. Find Associated Task

- If `task_path` parameter is provided:
  - If path ends with `.md`, treat as task file path and read it
  - If path is a directory, search for task file with matching `worktree_path` in frontmatter:
    ```bash
    grep -r "worktree_path: $task_path" task/ --include="*.md" -l
    ```
  - Store the task file path for later use (Step 9)
  - If no task file found, continue without task completion (no task exists)
- If `task_path` not provided, check current directory for task reference
- **Extract worktree path from task frontmatter** - this is the actual worktree directory path to use
- **Extract branch name** from worktree path or task if not provided as parameter
- Note: This step always runs, but a task may not exist for every worktree

### 3. Navigate to Main Repository

- Ensure you're in the main repository directory (not a worktree)
- Use `pwd` to verify current location
- The main repository path can be found from `git worktree list` (first entry)
- Navigate using `cd [main-repository-path]` if needed

### 4. Update Main Branch (Execute from main repository directory)

- Ensure you're in the main repository: `pwd` should show main repository path
- Switch to default branch: `git checkout $DEFAULT_BRANCH`
- Pull latest changes: `git pull origin $DEFAULT_BRANCH`

### 4.5. Push Submodule Changes First (Execute from worktree directory)

**CRITICAL**: Push submodule changes BEFORE rebase to prevent data loss when worktree is deleted.

- Navigate to worktree: `cd [worktree-path]`
- Check submodule status: `git submodule status`
- For each modified submodule (shows `+` prefix):
  - Enter submodule: `cd [submodule-path]`
  - Check branch status: `git status`
  - If uncommitted changes exist, commit them: `git add -A && git commit -m "feat: [description]"`
  - Push to remote: `git push origin [current-branch]`
  - Verify push succeeded: `git log origin/[current-branch]..HEAD` (should be empty)
  - Return to worktree root: `cd ../..`
  - Stage submodule reference: `git add [submodule-path]`
  - Commit if needed: `git commit -m "chore: update [submodule] reference"`
- Verify all submodules pushed: `git submodule foreach 'git log origin/HEAD..HEAD'` (should be empty for each)
- If any unpushed commits remain, STOP and push them before continuing

### 5. Rebase Feature Branch onto Main (Execute from worktree directory)

- **IMPORTANT**: Navigate to the worktree directory using the path from Step 2 or Step 0
  - Cannot checkout branch in main repository if it's active in a worktree
  - Must perform rebase FROM the worktree where the branch is checked out
- Verify you're in the worktree: `pwd` should show the worktree path
- Verify you're on the correct branch: `git branch --show-current` should show the feature branch name
- Rebase the feature branch onto the latest default branch: `git rebase $DEFAULT_BRANCH`
  - Use the DEFAULT_BRANCH variable from Step 0 (e.g., `master` or `main`)
- **If conflicts occur, do NOT attempt to resolve them yourself. Abort the rebase with `git rebase --abort` and report the issue to the team or reviewer.**
- After successful rebase, the output should show "Current branch [branch-name] is up to date" or list rebased commits

### 6. Verify Feature Branch (Execute from main repository directory)

- **Navigate back to the main repository directory** after rebase
- Verify you're in main repository: `pwd` should show main repository path
- Check branch exists: `git branch --list [branch-name]`
- Show branch commits to verify there are changes: `git log $DEFAULT_BRANCH..[branch-name] --oneline`
- This should display at least one commit that will be merged
- **Verify submodule commits are accessible**: `git submodule foreach 'git fetch origin && git log origin/HEAD..HEAD'` (should be empty)
- If any submodule has unpushed commits, STOP and return to Step 4.5

### 7. Perform Merge (Execute from main repository directory)

- Switch to default branch: `git checkout $DEFAULT_BRANCH`
- Merge the feature branch with no-fast-forward to preserve history:
  ```bash
  git merge [branch-name] --no-ff
  ```
- **If merge conflicts occur, do NOT attempt to resolve them yourself. Abort the merge with `git merge --abort` and report the issue to the team or reviewer.**
- Include a descriptive merge commit message that summarizes the feature

### 8. Push Changes (Execute from main repository directory)

- Push the merged changes to origin: `git push origin $DEFAULT_BRANCH`

### 9. Complete Associated Task (If Task Found)

- If task file was found in step 2:
  - Read the current task file to get its frontmatter
  - Update the `status` field from current value to `Completed`
  - Update the `updated_at` field to current ISO 8601 timestamp
  - Write the updated task file back
  - Report task completion: "Task [task_path] marked as Completed"
- If no task file was found, skip this step

### 10. Clean Up (Only After Successful Merge, Execute from main repository directory)

- **Pre-cleanup verification**:
  - Verify merge is pushed: `git log origin/$DEFAULT_BRANCH..$DEFAULT_BRANCH` (should be empty)
  - If unpushed changes exist, STOP and resolve before cleanup
- Find worktree path from earlier `git worktree list` output
- Remove the worktree: `git worktree remove [WORKTREE_PATH]`
  - If error "cannot remove working trees containing submodules": `rm -rf [WORKTREE_PATH] && git worktree prune`
- Delete the local branch: `git branch -d [branch-name]`
- Check if remote branch exists: `git ls-remote --heads origin | grep [branch-name]`
- If remote branch exists, delete it: `git push origin --delete [branch-name]`

### 11. Verify Success (Execute from main repository directory)

- Check git log to confirm merge commit exists: `git log -1 --oneline`
- Ensure working directory is clean: `git status`
- Verify worktree was removed: `git worktree list`

## Expected Output

The workflow should provide a summary including:

- Branch that was merged
- Merge commit hash and message
- Push status to origin/[DEFAULT_BRANCH]
- Task completion status (if applicable)
- Cleanup actions performed
- Any warnings or issues encountered
- Final repository status

## Error Handling

- **Branch doesn't exist**: Verify branch name and check `git branch -a` for all available branches
- **"fatal: 'branch-name' is already used by worktree"**: This should NOT occur if following Step 5 correctly (rebase from worktree, not main repo). If seen, verify you're in the worktree directory for the rebase step.
- **"fatal: Need to specify how to reconcile divergent branches"**: The pre-flight setup should prevent this. If encountered, run `git config pull.rebase false` and retry
- **Rebase conflicts**: Do NOT resolve them yourself. Abort with `git rebase --abort` and report conflicts that need resolution
- **Merge conflicts**: Do NOT resolve them yourself. Abort with `git merge --abort` and report conflicts that need resolution
- **Push failures**: Report the error and current repository state using `git status` and `git log -1 --oneline`
- **Worktree path not found**: Verify the worktree still exists with `git worktree list` and check the task file's `worktree_path` field is correct
- **Task file not found**: This is not an error - task completion is optional. Continue with merge and cleanup
- **Task file read/write errors**: Report the error but continue with merge and cleanup. Task can be updated manually
- **Cleanup failures**: Report what was successfully cleaned up and what remains using `git worktree list` and `git branch -a`
- **Submodule has unpushed commits**: Do NOT proceed with merge. Return to Step 4.5 and push submodule commits before continuing
- **Submodule commit not found on remote**: The merge will reference commits that don't exist remotely, causing failures for other developers. Push submodule commits in Step 4.5 before merging
- **Worktree removal fails with "containing submodules"**: Manually remove with `rm -rf [path]` then run `git worktree prune`

### Expected Success Output

```
✓ Verified and pushed all submodule changes
✓ Merged feature/new-component into [DEFAULT_BRANCH]
✓ Merge commit: abc1234 "Merge branch 'feature/new-component'"
✓ Pushed to origin/[DEFAULT_BRANCH]
✓ Task task/league/add-browser-persistence-to-data-views.md marked as Completed
✓ Cleaned up worktree and local branch
✓ Repository status: clean
```
