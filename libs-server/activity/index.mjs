import debug from 'debug'

import { aggregate_git_activity } from './aggregate-git-activity.mjs'
import { aggregate_task_activity } from './aggregate-task-activity.mjs'
import { aggregate_thread_activity } from './aggregate-thread-activity.mjs'
import { calculate_activity_score } from './calculate-activity-score.mjs'

const log = debug('activity')

export { aggregate_git_activity } from './aggregate-git-activity.mjs'
export { aggregate_task_activity } from './aggregate-task-activity.mjs'
export { aggregate_thread_activity } from './aggregate-thread-activity.mjs'
export { calculate_activity_score } from './calculate-activity-score.mjs'

/**
 * Merge git and thread activity arrays and calculate scores
 * Shared logic used by both full computation and DuckDB-backed queries.
 *
 * @param {Object} params Parameters
 * @param {Array} params.git_activity Array of git activity entries
 * @param {Array} params.thread_activity Array of thread activity entries
 * @param {Array} [params.task_activity] Array of task activity entries
 * @param {number} params.days Number of trailing days (for date range calculation)
 * @returns {Object} Heatmap data with data array, max_score, and date_range
 */
export function merge_activity_and_calculate_scores({
  git_activity,
  thread_activity,
  task_activity = [],
  days
}) {
  // Merge activities by date
  const combined_by_date = new Map()

  const empty_entry = (date) => ({
    date,
    activity_git_commits: 0,
    activity_git_lines_changed: 0,
    activity_git_files_changed: 0,
    activity_token_usage: 0,
    activity_thread_edits: 0,
    activity_thread_lines_changed: 0,
    tasks_created: 0,
    tasks_completed: 0
  })

  // Add git activity
  for (const entry of git_activity) {
    const combined = empty_entry(entry.date)
    combined.activity_git_commits = entry.activity_git_commits
    combined.activity_git_lines_changed = entry.activity_git_lines_changed
    combined.activity_git_files_changed = entry.activity_git_files_changed
    combined_by_date.set(entry.date, combined)
  }

  // Merge thread activity
  for (const entry of thread_activity) {
    if (!combined_by_date.has(entry.date)) {
      combined_by_date.set(entry.date, empty_entry(entry.date))
    }
    const existing = combined_by_date.get(entry.date)
    existing.activity_token_usage = entry.activity_token_usage
    existing.activity_thread_edits = entry.activity_thread_edits
    existing.activity_thread_lines_changed = entry.activity_thread_lines_changed
  }

  // Merge task activity
  for (const entry of task_activity) {
    if (!combined_by_date.has(entry.date)) {
      combined_by_date.set(entry.date, empty_entry(entry.date))
    }
    const existing = combined_by_date.get(entry.date)
    existing.tasks_created = entry.tasks_created
    existing.tasks_completed = entry.tasks_completed
  }

  // Calculate scores and convert to array
  const data = []
  let max_score = 0

  for (const entry of combined_by_date.values()) {
    const score = calculate_activity_score(entry)
    const entry_with_score = { ...entry, score }
    data.push(entry_with_score)

    if (score > max_score) {
      max_score = score
    }
  }

  // Sort by date
  data.sort((a, b) => a.date.localeCompare(b.date))

  // Calculate date range
  const until_date = new Date()
  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)

  const date_range = {
    start: since_date.toISOString().split('T')[0],
    end: until_date.toISOString().split('T')[0]
  }

  return {
    data,
    max_score,
    date_range
  }
}

/**
 * Get combined activity heatmap data
 * Merges git activity and thread activity, calculates scores
 *
 * @param {Object} params Parameters
 * @param {number} [params.days=365] Number of trailing days to include
 * @returns {Promise<Object>} Heatmap data with data array, max_score, and date_range
 */
export async function get_activity_heatmap_data({ days = 365 } = {}) {
  log(`Getting activity heatmap data for ${days} days`)

  // Fetch all activity sources in parallel
  const [git_activity, thread_activity, task_activity] = await Promise.all([
    aggregate_git_activity({ days }),
    aggregate_thread_activity({ days }),
    aggregate_task_activity({ days })
  ])

  const result = merge_activity_and_calculate_scores({
    git_activity,
    thread_activity,
    task_activity,
    days
  })

  log(
    `Returning ${result.data.length} days of activity data, max_score: ${result.max_score}`
  )

  return result
}
