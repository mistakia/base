import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('activity:git')

/**
 * Get list of git repositories in the active repository directory
 * @returns {Promise<Array<string>>} Array of repository paths
 */
async function get_active_repositories() {
  const active_repos_path = path.join(
    config.user_base_directory,
    'repository',
    'active'
  )

  try {
    const entries = await fs.readdir(active_repos_path, { withFileTypes: true })
    const repo_paths = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.endsWith('-worktrees')) continue
      if (entry.name.startsWith('.')) continue

      const repo_path = path.join(active_repos_path, entry.name)
      const git_dir = path.join(repo_path, '.git')

      try {
        await fs.access(git_dir)
        repo_paths.push(repo_path)
      } catch {
        // Not a git repository, skip
      }
    }

    return repo_paths
  } catch (error) {
    log(`Failed to read active repositories: ${error.message}`)
    return []
  }
}

/**
 * Get git activity for a single repository within a date range
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @param {string} params.since_date ISO date string (YYYY-MM-DD)
 * @param {string} params.until_date ISO date string (YYYY-MM-DD)
 * @returns {Promise<Map<string, Object>>} Map of date -> activity metrics
 */
async function get_repo_git_activity({ repo_path, since_date, until_date }) {
  const activity_by_date = new Map()

  try {
    // Get commits with stats using numstat for accurate line counts
    const { stdout } = await execute_shell_command(
      `git log --since="${since_date}" --until="${until_date}" --format="%H|%ad" --date=short --numstat`,
      { cwd: repo_path }
    )

    if (!stdout.trim()) {
      return activity_by_date
    }

    const lines = stdout.trim().split('\n')
    let current_date = null
    let current_commit_counted = false

    for (const line of lines) {
      if (line.includes('|')) {
        // This is a commit header line: hash|date
        const parts = line.split('|')
        current_date = parts[1]
        current_commit_counted = false

        if (!activity_by_date.has(current_date)) {
          activity_by_date.set(current_date, {
            activity_git_commits: 0,
            activity_git_lines_changed: 0,
            activity_git_files_changed: 0,
            files_seen: new Set()
          })
        }

        if (!current_commit_counted) {
          activity_by_date.get(current_date).activity_git_commits += 1
          current_commit_counted = true
        }
      } else if (line.trim() && current_date) {
        // This is a numstat line: additions\tdeletions\tfilename
        const parts = line.split('\t')
        if (parts.length >= 3) {
          const additions = parseInt(parts[0], 10) || 0
          const deletions = parseInt(parts[1], 10) || 0
          const filename = parts[2]

          const date_activity = activity_by_date.get(current_date)
          date_activity.activity_git_lines_changed += additions + deletions

          if (!date_activity.files_seen.has(filename)) {
            date_activity.files_seen.add(filename)
            date_activity.activity_git_files_changed += 1
          }
        }
      }
    }
  } catch (error) {
    log(`Failed to get git activity for ${repo_path}: ${error.message}`)
  }

  return activity_by_date
}

/**
 * Aggregate git activity from all active repositories
 * @param {Object} params Parameters
 * @param {number} [params.days=365] Number of trailing days to include
 * @returns {Promise<Array<Object>>} Array of daily activity objects
 */
export async function aggregate_git_activity({ days = 365 } = {}) {
  const until_date = new Date()
  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)

  const since_str = since_date.toISOString().split('T')[0]
  const until_str = until_date.toISOString().split('T')[0]

  log(`Aggregating git activity from ${since_str} to ${until_str}`)

  const repo_paths = await get_active_repositories()
  log(`Found ${repo_paths.length} active repositories`)

  // Aggregate activity from all repos
  const combined_activity = new Map()

  for (const repo_path of repo_paths) {
    const repo_activity = await get_repo_git_activity({
      repo_path,
      since_date: since_str,
      until_date: until_str
    })

    for (const [date, metrics] of repo_activity) {
      if (!combined_activity.has(date)) {
        combined_activity.set(date, {
          date,
          activity_git_commits: 0,
          activity_git_lines_changed: 0,
          activity_git_files_changed: 0
        })
      }

      const combined = combined_activity.get(date)
      combined.activity_git_commits += metrics.activity_git_commits
      combined.activity_git_lines_changed += metrics.activity_git_lines_changed
      combined.activity_git_files_changed += metrics.activity_git_files_changed
    }
  }

  // Convert to sorted array
  const result = Array.from(combined_activity.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  log(`Aggregated git activity for ${result.length} days`)
  return result
}
