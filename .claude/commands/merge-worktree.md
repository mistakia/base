<!-- Merge a worktree feature branch into main -->
<!-- Usage: /project:merge-worktree [branch-name] -->
<!-- Prerequisites: Feature branch should be reviewed and ready for merge -->

<task>Merge a worktree feature branch into the main branch following proper git workflow</task>

<context>
This command handles the complete workflow for merging a worktree feature branch into main.
The system uses git worktrees to isolate development work, and all changes must go through 
a proper merge process rather than direct commits to main. This ensures code quality and
maintains a clean git history.

Important: This command assumes the feature branch has been reviewed and is ready for merge.
Never merge unreviewed code directly into main.
</context>

<instructions>
1. If $ARGUMENTS is provided, use it as the branch name. Otherwise, use the current branch name.

2. Navigate to the main repository directory (not the worktree):
   - Use `pwd` to check current location
   - If in a worktree directory, navigate to the main repository using the parent directory path
   - The main repository is typically in the parent directory of the worktrees

3. Ensure main branch is up to date:
   - Switch to main branch: `git checkout main`
   - Pull latest changes: `git pull origin main`

4. Verify the feature branch exists and has commits:
   - Check branch exists: `git branch --list [branch-name]`
   - Show branch commits: `git log main..[branch-name] --oneline`

5. Merge the feature branch with no-fast-forward to preserve history:
   - Run: `git merge [branch-name] --no-ff`
   - Include a descriptive merge commit message

6. Push the merged changes:
   - Push to origin: `git push origin main`

7. Clean up the worktree and branch (only after successful merge):
   - Remove the worktree: `git worktree remove ../worktrees/[branch-name]`
   - Delete the local branch: `git branch -d [branch-name]`
   - Optionally delete remote branch if it exists: `git push origin --delete [branch-name]`

8. Verify the merge was successful:
   - Check git log to confirm merge commit exists
   - Ensure working directory is clean: `git status`
</instructions>

<output_format>
Provide a summary including:

- Branch that was merged
- Merge commit hash and message
- Push status to origin/main
- Cleanup actions performed
- Any warnings or issues encountered
- Final repository status

Format as a clear, structured report that confirms the merge workflow completed successfully.
</output_format>