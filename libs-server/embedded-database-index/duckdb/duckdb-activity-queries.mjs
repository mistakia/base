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

// ---------------------------------------------------------------------------
// activity_heatmap_daily table operations
// ---------------------------------------------------------------------------

/**
 * Read all cached heatmap daily rows within the trailing date range.
 * @param {Object} [params] Parameters
 * @param {number} [params.days=365] Number of trailing days to include
 * @returns {Promise<Array>} Array of daily heatmap entry objects
 */
export async function query_heatmap_daily_all({ days = 365 } = {}) {
  log('Querying heatmap daily cache for last %d days', days)

  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)
  const since_str = since_date.toISOString().split('T')[0]

  const result = await execute_duckdb_query({
    query: `
      SELECT
        date,
        activity_git_commits,
        activity_git_lines_changed,
        activity_git_files_changed,
        activity_token_usage,
        activity_thread_edits,
        activity_thread_lines_changed,
        score
      FROM activity_heatmap_daily
      WHERE date >= ?
      ORDER BY date ASC
    `,
    parameters: [since_str]
  })

  log('Retrieved %d heatmap daily rows', result.length)

  return result.map((row) => ({
    date: format_date_to_string(row.date),
    activity_git_commits: row.activity_git_commits,
    activity_git_lines_changed: row.activity_git_lines_changed,
    activity_git_files_changed: row.activity_git_files_changed,
    activity_token_usage: row.activity_token_usage,
    activity_thread_edits: row.activity_thread_edits,
    activity_thread_lines_changed: row.activity_thread_lines_changed,
    score: row.score
  }))
}

/**
 * Bulk upsert an array of daily heatmap entries.
 * @param {Object} params Parameters
 * @param {Array} params.entries Array of { date, activity_git_commits, ... , score }
 * @returns {Promise<void>}
 */
export async function upsert_heatmap_daily_batch({ entries }) {
  if (!entries || entries.length === 0) return

  log('Upserting %d heatmap daily entries', entries.length)

  const updated_at = new Date().toISOString()

  // Batch into chunks to avoid overly large SQL statements
  const CHUNK_SIZE = 50
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE)
    const placeholders = chunk
      .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .join(', ')
    const parameters = chunk.flatMap((entry) => [
      entry.date,
      entry.activity_git_commits ?? 0,
      entry.activity_git_lines_changed ?? 0,
      entry.activity_git_files_changed ?? 0,
      entry.activity_token_usage ?? 0,
      entry.activity_thread_edits ?? 0,
      entry.activity_thread_lines_changed ?? 0,
      entry.score ?? 0,
      updated_at
    ])

    await execute_duckdb_run({
      query: `
        INSERT INTO activity_heatmap_daily (
          date, activity_git_commits, activity_git_lines_changed,
          activity_git_files_changed, activity_token_usage,
          activity_thread_edits, activity_thread_lines_changed,
          score, updated_at
        ) VALUES ${placeholders}
        ON CONFLICT (date) DO UPDATE SET
          activity_git_commits = excluded.activity_git_commits,
          activity_git_lines_changed = excluded.activity_git_lines_changed,
          activity_git_files_changed = excluded.activity_git_files_changed,
          activity_token_usage = excluded.activity_token_usage,
          activity_thread_edits = excluded.activity_thread_edits,
          activity_thread_lines_changed = excluded.activity_thread_lines_changed,
          score = excluded.score,
          updated_at = excluded.updated_at
      `,
      parameters
    })
  }

  log('Upserted %d heatmap daily entries', entries.length)
}

/**
 * Get the row count in activity_heatmap_daily (for cold-start detection).
 * @returns {Promise<number>} Row count
 */
export async function get_heatmap_daily_count() {
  const result = await execute_duckdb_query({
    query: 'SELECT count(*) as cnt FROM activity_heatmap_daily'
  })

  const count = Number(result[0]?.cnt) || 0
  log('Heatmap daily row count: %d', count)
  return count
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
