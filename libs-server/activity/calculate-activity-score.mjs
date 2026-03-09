import { ACTIVITY_SCORE_WEIGHTS } from '#libs-shared/activity-score-weights.mjs'

/**
 * Calculate combined activity score from individual metrics
 *
 * @param {Object} params Activity metrics
 * @param {number} [params.activity_git_commits=0] Number of git commits
 * @param {number} [params.activity_git_files_changed=0] Number of files changed in git
 * @param {number} [params.activity_git_lines_changed=0] Number of lines changed in git
 * @param {number} [params.activity_token_usage=0] Total token usage
 * @param {number} [params.activity_thread_edits=0] Number of file edits in threads
 * @param {number} [params.activity_thread_lines_changed=0] Lines changed in thread edits
 * @param {number} [params.tasks_completed=0] Number of tasks completed
 * @param {number} [params.tasks_created=0] Number of tasks created
 * @returns {number} Combined activity score
 */
export function calculate_activity_score({
  activity_git_commits = 0,
  activity_git_files_changed = 0,
  activity_git_lines_changed = 0,
  activity_token_usage = 0,
  activity_thread_edits = 0,
  activity_thread_lines_changed = 0,
  tasks_completed = 0,
  tasks_created = 0
} = {}) {
  const W = ACTIVITY_SCORE_WEIGHTS

  return (
    activity_git_commits * W.git_commits +
    activity_git_files_changed * W.git_files_changed +
    Math.floor(activity_git_lines_changed / W.git_lines_changed_divisor) +
    Math.floor(activity_token_usage / W.token_usage_divisor) +
    activity_thread_edits * W.thread_edits +
    Math.floor(activity_thread_lines_changed / W.thread_lines_changed_divisor) +
    tasks_completed * W.tasks_completed +
    tasks_created * W.tasks_created
  )
}
