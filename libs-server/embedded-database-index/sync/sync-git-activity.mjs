/**
 * Git Activity Sync
 *
 * Handles incremental synchronization of git activity data to SQLite.
 * Tracks per-repository HEAD SHA to detect changes and only process new commits.
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'
import {
  get_index_metadata,
  set_index_metadata,
  INDEX_METADATA_KEYS
} from '../sqlite/sqlite-metadata-operations.mjs'
import { upsert_git_activity_daily_batch } from '../sqlite/sqlite-activity-queries.mjs'

const log = debug('embedded-index:sync:git-activity')

if (!config.user_base_directory) {
  throw new Error('config.user_base_directory is not configured')
}

/**
 * Parse git log --numstat output into activity metrics by date
 * Note: files_changed counts unique files per date (not total modifications)
 * @param {Object} params Parameters
 * @param {string} params.stdout Raw git log output
 * @param {Map} [params.activity_by_date] Existing activity map to merge into (optional)
 * @returns {Map<string, Object>} Map of date -> activity metrics
 */
function parse_git_log_numstat({ stdout, activity_by_date = new Map() }) {
  if (!stdout.trim()) {
    return activity_by_date
  }

  const lines = stdout.trim().split('\n')
  let current_date = null
  let current_commit_counted = false

  for (const line of lines) {
    if (line.includes('\t') && line.match(/^[a-f0-9]{40}\t/)) {
      // This is a commit header line: hash<TAB>date
      const parts = line.split('\t')
      current_date = parts[1]
      current_commit_counted = false

      if (!activity_by_date.has(current_date)) {
        activity_by_date.set(current_date, {
          commits: 0,
          lines_changed: 0,
          files_changed: 0,
          files_seen: new Set()
        })
      }

      if (!current_commit_counted) {
        activity_by_date.get(current_date).commits += 1
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
        date_activity.lines_changed += additions + deletions

        if (!date_activity.files_seen.has(filename)) {
          date_activity.files_seen.add(filename)
          date_activity.files_changed += 1
        }
      }
    }
  }

  return activity_by_date
}

/**
 * Get list of git repositories in the active repository directory
 * @returns {Promise<Array<{path: string, name: string}>>} Array of repository info
 */
async function get_active_repositories() {
  const active_repos_path = path.join(
    config.user_base_directory,
    'repository',
    'active'
  )

  try {
    const entries = await fs.readdir(active_repos_path, { withFileTypes: true })
    const repo_info = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.endsWith('-worktrees')) continue
      if (entry.name.startsWith('.')) continue

      const repo_path = path.join(active_repos_path, entry.name)
      const git_dir = path.join(repo_path, '.git')

      try {
        await fs.access(git_dir)
        repo_info.push({
          path: repo_path,
          name: entry.name
        })
      } catch {
        // Not a git repository, skip
      }
    }

    return repo_info
  } catch (error) {
    log('Failed to read active repositories: %s', error.message)
    return []
  }
}

/**
 * Get current HEAD SHA for a repository
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<string|null>} Current HEAD SHA or null on error
 */
async function get_repo_head_sha({ repo_path }) {
  try {
    const { stdout } = await execute_shell_command('git rev-parse HEAD', {
      cwd: repo_path
    })
    return stdout.trim()
  } catch (error) {
    log('Failed to get HEAD SHA for %s: %s', repo_path, error.message)
    return null
  }
}

/**
 * Check if a commit SHA exists in the repository
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @param {string} params.sha Commit SHA to verify
 * @returns {Promise<boolean>}
 */
async function verify_commit_exists({ repo_path, sha }) {
  // Validate SHA format (hex only)
  if (!sha || !/^[a-f0-9]{4,40}$/i.test(sha)) {
    return false
  }

  try {
    await execute_shell_command(`git cat-file -t '${sha}'`, { cwd: repo_path })
    return true
  } catch {
    return false
  }
}

/**
 * Get git activity for commits since a given SHA
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @param {string|null} params.since_sha SHA to start from (null for all history)
 * @param {string|null} params.until_sha SHA to end at (null for HEAD)
 * @returns {Promise<Map<string, Object>>} Map of date -> activity metrics
 */
async function get_git_activity_since_sha({
  repo_path,
  since_sha,
  until_sha = null
}) {
  try {
    // Build git log command (use tab delimiter to avoid shell metacharacter validation)
    let git_command = 'git log --format="%H%x09%ad" --date=short --numstat'

    if (since_sha) {
      const sha_exists = await verify_commit_exists({
        repo_path,
        sha: since_sha
      })
      if (sha_exists) {
        // Include commits since (but not including) since_sha
        git_command += ` '${since_sha}'..HEAD`
      } else {
        log('SHA %s not found in repo, processing all commits', since_sha)
      }
    }

    const { stdout } = await execute_shell_command(git_command, {
      cwd: repo_path,
      timeout: 120_000
    })

    return parse_git_log_numstat({ stdout })
  } catch (error) {
    log('Failed to get git activity for %s: %s', repo_path, error.message)
    return new Map()
  }
}

/**
 * Get the git activity sync state (per-repo SHA tracking)
 * @returns {Promise<Object>} Object mapping repo_name to { sha }
 */
async function get_git_activity_sync_state() {
  const state_json = await get_index_metadata({
    key: INDEX_METADATA_KEYS.ACTIVITY_GIT_SYNC_STATE
  })

  if (state_json) {
    try {
      return JSON.parse(state_json)
    } catch (error) {
      log('Failed to parse activity git sync state: %s', error.message)
    }
  }

  return {}
}

/**
 * Set the git activity sync state
 * @param {Object} params Parameters
 * @param {Object} params.state Object mapping repo_name to { sha }
 */
async function set_git_activity_sync_state({ state }) {
  await set_index_metadata({
    key: INDEX_METADATA_KEYS.ACTIVITY_GIT_SYNC_STATE,
    value: JSON.stringify(state)
  })
}

/**
 * Sync git activity incrementally
 * Detects new commits since last sync and updates activity_git_daily table.
 * @returns {Promise<{success: boolean, repos_synced: number, dates_updated: number}>}
 */
export async function sync_git_activity_incremental() {
  log('Starting incremental git activity sync')

  const repos = await get_active_repositories()
  log('Found %d active repositories', repos.length)

  const sync_state = await get_git_activity_sync_state()
  const new_sync_state = {}

  // Aggregate activity across all repos by date
  const combined_activity = new Map()
  let repos_synced = 0

  for (const repo of repos) {
    const last_sha = sync_state[repo.name]?.sha || null
    const current_sha = await get_repo_head_sha({ repo_path: repo.path })

    if (!current_sha) {
      log('Skipping repo %s: could not get HEAD SHA', repo.name)
      continue
    }

    // Store new SHA for sync state
    new_sync_state[repo.name] = { sha: current_sha }

    // Skip if no changes
    if (last_sha === current_sha) {
      log('Repo %s: no changes since last sync', repo.name)
      continue
    }

    log(
      'Repo %s: syncing commits from %s to %s',
      repo.name,
      last_sha?.slice(0, 7) || 'beginning',
      current_sha.slice(0, 7)
    )

    const repo_activity = await get_git_activity_since_sha({
      repo_path: repo.path,
      since_sha: last_sha
    })

    // Merge repo activity into combined
    for (const [date, metrics] of repo_activity) {
      if (!combined_activity.has(date)) {
        combined_activity.set(date, {
          commits: 0,
          lines_changed: 0,
          files_changed: 0
        })
      }

      const combined = combined_activity.get(date)
      combined.commits += metrics.commits
      combined.lines_changed += metrics.lines_changed
      combined.files_changed += metrics.files_changed
    }

    repos_synced++
  }

  // Update SQLite with combined activity using batch insert
  const entries = Array.from(combined_activity, ([date, metrics]) => ({
    date,
    commits: metrics.commits,
    lines_changed: metrics.lines_changed,
    files_changed: metrics.files_changed
  }))

  await upsert_git_activity_daily_batch({ entries })

  // Save new sync state
  await set_git_activity_sync_state({ state: new_sync_state })

  log(
    'Incremental git activity sync complete: %d repos, %d dates updated',
    repos_synced,
    entries.length
  )

  return {
    success: true,
    repos_synced,
    dates_updated: entries.length
  }
}

/**
 * Backfill git activity from scratch
 * Processes full git history for all repositories.
 * Used during index rebuild.
 * @param {Object} [params] Parameters
 * @param {number} [params.days=365] Number of trailing days to include
 * @returns {Promise<{success: boolean, repos_processed: number, dates_stored: number}>}
 */
export async function backfill_git_activity_from_scratch({ days = 365 } = {}) {
  log('Starting git activity backfill for last %d days', days)

  const repos = await get_active_repositories()
  log('Found %d active repositories', repos.length)

  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)
  const since_str = since_date.toISOString().split('T')[0]

  const new_sync_state = {}
  const combined_activity = new Map()
  let repos_processed = 0

  for (const repo of repos) {
    const current_sha = await get_repo_head_sha({ repo_path: repo.path })

    if (!current_sha) {
      log('Skipping repo %s: could not get HEAD SHA', repo.name)
      continue
    }

    new_sync_state[repo.name] = { sha: current_sha }

    try {
      // Get all commits in date range (use tab delimiter via %x09 to avoid shell metacharacter validation)
      const { stdout } = await execute_shell_command(
        `git log --since="${since_str}" --format="%H%x09%ad" --date=short --numstat`,
        { cwd: repo.path, timeout: 120_000 }
      )

      // Parse and merge into combined activity map
      parse_git_log_numstat({ stdout, activity_by_date: combined_activity })
      repos_processed++
    } catch (error) {
      log('Failed to get git activity for %s: %s', repo.path, error.message)
    }
  }

  // Store all activity in SQLite using batch insert
  const entries = Array.from(combined_activity, ([date, metrics]) => ({
    date,
    commits: metrics.commits,
    lines_changed: metrics.lines_changed,
    files_changed: metrics.files_changed
  }))

  await upsert_git_activity_daily_batch({ entries })

  // Save sync state
  await set_git_activity_sync_state({ state: new_sync_state })

  log(
    'Git activity backfill complete: %d repos, %d dates stored',
    repos_processed,
    entries.length
  )

  return {
    success: true,
    repos_processed,
    dates_stored: entries.length
  }
}
