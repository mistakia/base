/**
 * Activity score weights used by both server-side score calculation
 * and client-side heatmap filter recalculation.
 */

export const ACTIVITY_SCORE_WEIGHTS = {
  git_commits: 10,
  git_files_changed: 2,
  git_lines_changed_divisor: 100,
  token_usage_divisor: 1000,
  thread_edits: 5,
  thread_lines_changed_divisor: 50,
  tasks_completed: 20,
  tasks_created: 3
}
