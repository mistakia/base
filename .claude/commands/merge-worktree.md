<!-- Merge a worktree feature branch into main -->
<!-- Usage: /project:merge-worktree [branch-name] -->
<!-- Prerequisites: Feature branch should be reviewed and ready for merge -->

<task>Merge a worktree feature branch into the main branch following proper git workflow</task>

<context>
This command implements the workflow defined in [[system/workflow/merge-worktree.md]].
The system uses git worktrees to isolate development work, and all changes must go through 
a proper merge process rather than direct commits to main. This ensures code quality and
maintains a clean git history.

Important: This command assumes the feature branch has been reviewed and is ready for merge.
Never merge unreviewed code directly into main.

If branch_name is provided, use it as the branch name. Otherwise, use the current branch name.

<branch_name>$ARGUMENTS</branch_name>
</context>
