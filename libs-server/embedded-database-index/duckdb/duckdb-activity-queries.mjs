/**
 * DuckDB Activity Queries
 *
 * CRUD operations for activity_git_daily table and thread activity aggregation.
 */

import debug from 'debug'

import {
  execute_duckdb_query,
  execute_duckdb_run
} from './duckdb-database-client.mjs'

const log = debug('embedded-index:duckdb:activity')

/**
 * Convert a date value (Date object or string) to YYYY-MM-DD string format
 */
function format_date_to_string(date) {
  if (!date) return null
  if (date instanceof Date) return date.toISOString().split('T')[0]
  return date
}

/**
 * Query all git activity daily records
 * @param {Object} [params] Parameters
 * @param {number} [params.days=365] Number of trailing days to include
 * @returns {Promise<Array>} Array of daily activity objects
 */
export async function query_git_activity_daily({ days = 365 } = {}) {
  log('Querying git activity for last %d days', days)

  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)
  const since_str = since_date.toISOString().split('T')[0]

  const result = await execute_duckdb_query({
    query: `
      SELECT
        date,
        commits,
        lines_changed,
        files_changed
      FROM activity_git_daily
      WHERE date >= ?
      ORDER BY date ASC
    `,
    parameters: [since_str]
  })

  log('Retrieved %d git activity records', result.length)

  return result.map((row) => ({
    date: format_date_to_string(row.date),
    activity_git_commits: row.commits,
    activity_git_lines_changed: row.lines_changed,
    activity_git_files_changed: row.files_changed
  }))
}

/**
 * Upsert git activity for a specific date
 * @param {Object} params Parameters
 * @param {string} params.date Date in YYYY-MM-DD format
 * @param {number} params.commits Number of commits
 * @param {number} params.lines_changed Number of lines changed
 * @param {number} params.files_changed Number of files changed
 * @returns {Promise<void>}
 */
export async function upsert_git_activity_daily({
  date,
  commits,
  lines_changed,
  files_changed
}) {
  log('Upserting git activity for date: %s', date)

  const updated_at = new Date().toISOString()

  await execute_duckdb_run({
    query: `
      INSERT INTO activity_git_daily (date, commits, lines_changed, files_changed, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (date) DO UPDATE SET
        commits = excluded.commits,
        lines_changed = excluded.lines_changed,
        files_changed = excluded.files_changed,
        updated_at = excluded.updated_at
    `,
    parameters: [date, commits, lines_changed, files_changed, updated_at]
  })
}

/**
 * Query thread activity aggregated by date
 * Sums token usage and edit metrics grouped by thread creation date.
 * @param {Object} [params] Parameters
 * @param {number} [params.days=365] Number of trailing days to include
 * @returns {Promise<Array>} Array of daily activity aggregates
 */
export async function query_thread_activity_aggregated({ days = 365 } = {}) {
  log('Querying thread activity aggregated for last %d days', days)

  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)
  const since_str = since_date.toISOString().split('T')[0]

  const result = await execute_duckdb_query({
    query: `
      SELECT
        CAST(created_at AS DATE) as date,
        COALESCE(SUM(total_input_tokens), 0) + COALESCE(SUM(total_output_tokens), 0) as total_tokens,
        COALESCE(SUM(edit_count), 0) as edit_count,
        COALESCE(SUM(lines_changed), 0) as lines_changed
      FROM threads
      WHERE created_at >= ?
      GROUP BY CAST(created_at AS DATE)
      ORDER BY date ASC
    `,
    parameters: [since_str]
  })

  log('Retrieved %d thread activity aggregates', result.length)

  return result.map((row) => ({
    date: format_date_to_string(row.date),
    activity_token_usage: Number(row.total_tokens) || 0,
    activity_thread_edits: Number(row.edit_count) || 0,
    activity_thread_lines_changed: Number(row.lines_changed) || 0
  }))
}

/**
 * Query tasks from entities table
 * @param {Object} [params] Parameters
 * @param {boolean} [params.archived=false] Include archived tasks
 * @returns {Promise<Array>} Array of task entities
 */
export async function query_tasks_from_entities({ archived = false } = {}) {
  log('Querying tasks from entities, archived=%s', archived)

  const result = await execute_duckdb_query({
    query: `
      SELECT
        base_uri,
        entity_id,
        title,
        description,
        status,
        priority,
        archived,
        user_public_key,
        created_at,
        updated_at,
        frontmatter
      FROM entities
      WHERE type = 'task'
        AND archived = ?
      ORDER BY updated_at DESC
    `,
    parameters: [archived]
  })

  log('Retrieved %d tasks', result.length)

  return result.map((row) => {
    const frontmatter =
      typeof row.frontmatter === 'string'
        ? JSON.parse(row.frontmatter)
        : row.frontmatter || {}

    return {
      base_uri: row.base_uri,
      entity_id: row.entity_id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      archived: row.archived,
      user_public_key: row.user_public_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ...frontmatter
    }
  })
}
