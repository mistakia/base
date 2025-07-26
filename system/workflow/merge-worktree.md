---
title: Merge Worktree Feature Branch
type: workflow
description: Merge a worktree feature branch into the main branch following proper git workflow
created_at: '2025-06-14T17:43:40.946Z'
entity_id: a37c88c1-97d3-483a-b30e-7871c3a243bb
observations:
  - '[workflow] Proper merge process ensures code quality and maintains clean git history'
  - '[principle] All changes must go through proper merge process rather than direct commits to main'
  - '[requirement] Feature branch should be reviewed and ready for merge before using this workflow'
prompt_properties:
  - name: branch_name
    description: Name of the feature branch to merge (optional, defaults to current branch)
    type: string
    required: false
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
updated_at: '2025-06-14T17:43:40.949Z'
user_id: 00000000-0000-0000-0000-000000000000
---

# Merge Worktree Feature Branch

## Overview

This workflow handles the complete process for merging a worktree feature branch into the main branch. The system uses git worktrees to isolate development work, and all changes must go through a proper merge process rather than direct commits to main.

**Important**: This workflow assumes the feature branch has been reviewed and is ready for merge. Never merge unreviewed code directly into main.

## Prerequisites

- Feature branch should be reviewed and ready for merge
- Access to the main repository directory
- Proper git permissions for pushing to main branch

## Instructions

### 0. Pre-flight Setup

- Configure git pull behavior to avoid conflicts: `git config pull.rebase false`
- Detect default branch name: `DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD | cut -d'/' -f4)`
- List all worktrees to identify paths: `git worktree list`
- Verify target worktree exists in the worktree list output

### 0. Pre-flight Setup

- Configure git pull behavior to avoid conflicts: `git config pull.rebase false`
- Detect default branch name: `DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD | cut -d'/' -f4)`
- List all worktrees to identify paths: `git worktree list`
- Verify target worktree exists in the worktree list output

### 1. Determine Branch Name

- If `branch_name` parameter is provided, use it as the branch name
- Otherwise, use the current branch name from the working directory

### 2. Navigate to Main Repository

- Use `pwd` to check current location
- If currently in a worktree directory, navigate to the main repository using the parent directory path
- The main repository is typically in the parent directory of the worktrees

### 3. Update Main Branch (Execute from main repository directory)
### 3. Update Main Branch (Execute from main repository directory)

- Ensure you're in the main repository: `pwd` should show main repository path
- Switch to default branch: `git checkout $DEFAULT_BRANCH`
- Pull latest changes: `git pull origin $DEFAULT_BRANCH`
- Ensure you're in the main repository: `pwd` should show main repository path
- Switch to default branch: `git checkout $DEFAULT_BRANCH`
- Pull latest changes: `git pull origin $DEFAULT_BRANCH`

### 4. Rebase Feature Branch onto Main (Execute from main repository directory)
### 4. Rebase Feature Branch onto Main (Execute from main repository directory)

- Switch to the feature branch: `git checkout [branch-name]`
- Rebase the feature branch onto the latest default branch: `git rebase $DEFAULT_BRANCH`
- Rebase the feature branch onto the latest default branch: `git rebase $DEFAULT_BRANCH`
- **If conflicts occur, do NOT attempt to resolve them yourself. Abort the rebase with `git rebase --abort` and report the issue to the team or reviewer.**
- **If you get "fatal: 'branch-name' is already used by worktree" error, you are in the wrong directory. Ensure you are in the main repository directory, not a worktree directory.**
- **If you get "fatal: 'branch-name' is already used by worktree" error, you are in the wrong directory. Ensure you are in the main repository directory, not a worktree directory.**
- After successful rebase, ensure all changes are as expected

### 5. Verify Feature Branch (Execute from main repository directory)
### 5. Verify Feature Branch (Execute from main repository directory)

- Check branch exists: `git branch --list [branch-name]`
- Show branch commits to verify there are changes: `git log $DEFAULT_BRANCH..[branch-name] --oneline`
- Show branch commits to verify there are changes: `git log $DEFAULT_BRANCH..[branch-name] --oneline`

### 6. Perform Merge (Execute from main repository directory)
### 6. Perform Merge (Execute from main repository directory)

- Switch to default branch: `git checkout $DEFAULT_BRANCH`
- Switch to default branch: `git checkout $DEFAULT_BRANCH`
- Merge the feature branch with no-fast-forward to preserve history:
  ```bash
  git merge [branch-name] --no-ff
  ```
- **If merge conflicts occur, do NOT attempt to resolve them yourself. Abort the merge with `git merge --abort` and report the issue to the team or reviewer.**
- Include a descriptive merge commit message that summarizes the feature

### 7. Push Changes (Execute from main repository directory)
### 7. Push Changes (Execute from main repository directory)

- Push the merged changes to origin: `git push origin $DEFAULT_BRANCH`
- Push the merged changes to origin: `git push origin $DEFAULT_BRANCH`

### 8. Clean Up (Only After Successful Merge, Execute from main repository directory)
### 8. Clean Up (Only After Successful Merge, Execute from main repository directory)

- Find worktree path from earlier `git worktree list` output
- Remove the worktree using the discovered path: `git worktree remove [WORKTREE_PATH]`
- Find worktree path from earlier `git worktree list` output
- Remove the worktree using the discovered path: `git worktree remove [WORKTREE_PATH]`
- Delete the local branch: `git branch -d [branch-name]`
- Check if remote branch exists: `git ls-remote --heads origin | grep [branch-name]`
- If remote branch exists, delete it: `git push origin --delete [branch-name]`
- Check if remote branch exists: `git ls-remote --heads origin | grep [branch-name]`
- If remote branch exists, delete it: `git push origin --delete [branch-name]`

### 9. Verify Success (Execute from main repository directory)
### 9. Verify Success (Execute from main repository directory)

- Check git log to confirm merge commit exists: `git log -1 --oneline`
- Check git log to confirm merge commit exists: `git log -1 --oneline`
- Ensure working directory is clean: `git status`
- Verify worktree was removed: `git worktree list`
- Verify worktree was removed: `git worktree list`

## Expected Output

The workflow should provide a summary including:

- Branch that was merged
- Merge commit hash and message
- Push status to origin/[DEFAULT_BRANCH]
- Push status to origin/[DEFAULT_BRANCH]
- Cleanup actions performed
- Any warnings or issues encountered
- Final repository status

## Error Handling

- **Branch doesn't exist**: Verify branch name and check `git branch -a` for all available branches
- **"fatal: 'branch-name' is already used by worktree"**: You are in a worktree directory. Navigate to the main repository directory using the path from `git worktree list`
- **"fatal: Need to specify how to reconcile divergent branches"**: The pre-flight setup should prevent this. If encountered, run `git config pull.rebase false` and retry
- **Rebase conflicts**: Do NOT resolve them yourself. Abort with `git rebase --abort` and report conflicts that need resolution
- **Merge conflicts**: Do NOT resolve them yourself. Abort with `git merge --abort` and report conflicts that need resolution
- **Push failures**: Report the error and current repository state using `git status` and `git log -1 --oneline`
- **Cleanup failures**: Report what was successfully cleaned up and what remains using `git worktree list` and `git branch -a`

### Expected Success Output

```
✓ Merged feature/new-component into [DEFAULT_BRANCH]
✓ Merged feature/new-component into [DEFAULT_BRANCH]
✓ Merge commit: abc1234 "Merge branch 'feature/new-component'"
✓ Pushed to origin/[DEFAULT_BRANCH]
✓ Pushed to origin/[DEFAULT_BRANCH]
✓ Cleaned up worktree and local branch
✓ Repository status: clean
```
