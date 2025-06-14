---
title: 'Merge Worktree Feature Branch'
type: 'workflow'
description: |
  Merge a worktree feature branch into the main branch following proper git workflow
prompt_properties:
  - name: 'branch_name'
    description: 'Name of the feature branch to merge (optional, defaults to current branch)'
    type: 'string'
    required: false
observations:
  - '[workflow] Proper merge process ensures code quality and maintains clean git history'
  - '[principle] All changes must go through proper merge process rather than direct commits to main'
  - '[requirement] Feature branch should be reviewed and ready for merge before using this workflow'
relations:
  - 'implements [[system/schema/workflow.md]]'
  - 'follows [[system/guideline/write-workflow.md]]'
user_id: '00000000-0000-0000-0000-000000000000'
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

### 1. Determine Branch Name

- If `branch_name` parameter is provided, use it as the branch name
- Otherwise, use the current branch name from the working directory

### 2. Navigate to Main Repository

- Use `pwd` to check current location
- If currently in a worktree directory, navigate to the main repository using the parent directory path
- The main repository is typically in the parent directory of the worktrees

### 3. Update Main Branch

- Switch to main branch: `git checkout main`
- Pull latest changes: `git pull origin main`

### 4. Verify Feature Branch

- Check branch exists: `git branch --list [branch-name]`
- Show branch commits to verify there are changes: `git log main..[branch-name] --oneline`

### 5. Perform Merge

- Merge the feature branch with no-fast-forward to preserve history:
  ```bash
  git merge [branch-name] --no-ff
  ```
- Include a descriptive merge commit message that summarizes the feature

### 6. Push Changes

- Push the merged changes to origin: `git push origin main`

### 7. Clean Up (Only After Successful Merge)

- Remove the worktree: `git worktree remove ../worktrees/[branch-name]`
- Delete the local branch: `git branch -d [branch-name]`
- Optionally delete remote branch if it exists: `git push origin --delete [branch-name]`

### 8. Verify Success

- Check git log to confirm merge commit exists
- Ensure working directory is clean: `git status`

## Expected Output

The workflow should provide a summary including:

- Branch that was merged
- Merge commit hash and message
- Push status to origin/main
- Cleanup actions performed
- Any warnings or issues encountered
- Final repository status

## Error Handling

- If branch doesn't exist, abort and report error
- If merge conflicts occur, abort merge and report conflicts that need resolution
- If push fails, report the error and current state
- If cleanup fails, report what was successfully cleaned up and what remains

### Expected Success Output

```
✓ Merged feature/new-component into main
✓ Merge commit: abc1234 "Merge branch 'feature/new-component'"
✓ Pushed to origin/main
✓ Cleaned up worktree and local branch
✓ Repository status: clean
```
