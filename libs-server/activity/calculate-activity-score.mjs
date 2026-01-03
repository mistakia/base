/**
 * Calculate combined activity score from individual metrics
 *
 * Weighting formula:
 * - Git commits: High value (10 points each)
 * - Git files changed: Medium value (2 points each)
 * - Git lines changed: Low value (1 point per 100 lines)
 * - Token usage: Low value (1 point per 1000 tokens)
 * - Thread edits: Medium-high value (5 points each)
 *
 * @param {Object} params Activity metrics
 * @param {number} [params.activity_git_commits=0] Number of git commits
 * @param {number} [params.activity_git_files_changed=0] Number of files changed in git
 * @param {number} [params.activity_git_lines_changed=0] Number of lines changed in git
 * @param {number} [params.activity_token_usage=0] Total token usage
 * @param {number} [params.activity_thread_edits=0] Number of file edits in threads
 * @param {number} [params.activity_thread_lines_changed=0] Lines changed in thread edits
 * @returns {number} Combined activity score
 */
export function calculate_activity_score({
  activity_git_commits = 0,
  activity_git_files_changed = 0,
  activity_git_lines_changed = 0,
  activity_token_usage = 0,
  activity_thread_edits = 0,
  activity_thread_lines_changed = 0
} = {}) {
  const git_commits_score = activity_git_commits * 10
  const git_files_score = activity_git_files_changed * 2
  const git_lines_score = Math.floor(activity_git_lines_changed / 100)
  const token_score = Math.floor(activity_token_usage / 1000)
  const thread_edits_score = activity_thread_edits * 5
  const thread_lines_score = Math.floor(activity_thread_lines_changed / 50)

  return (
    git_commits_score +
    git_files_score +
    git_lines_score +
    token_score +
    thread_edits_score +
    thread_lines_score
  )
}
