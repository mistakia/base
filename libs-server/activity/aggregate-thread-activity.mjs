import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { read_timeline_jsonl_or_default } from '#libs-server/threads/timeline/index.mjs'

const log = debug('activity:thread')

/**
 * Get token usage aggregated by date from SQLite
 * @param {Object} params Parameters
 * @param {string} params.since_date ISO date string (YYYY-MM-DD)
 * @param {string} params.until_date ISO date string (YYYY-MM-DD)
 * @returns {Promise<Map<string, Object>>} Map of date -> token metrics
 */
async function get_token_usage_by_date({ since_date, until_date }) {
  const token_by_date = new Map()

  try {
    const query = `
      SELECT
        date(created_at) as date,
        SUM(COALESCE(cumulative_input_tokens, 0)) as input_tokens,
        SUM(COALESCE(cumulative_output_tokens, 0)) as output_tokens,
        SUM(COALESCE(cumulative_cache_creation_input_tokens, 0)) as cache_creation_tokens,
        SUM(COALESCE(cumulative_cache_read_input_tokens, 0)) as cache_read_tokens,
        SUM(COALESCE(total_tokens, 0)) as total_tokens
      FROM threads
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY date(created_at)
      ORDER BY date
    `

    const results = await execute_sqlite_query({
      query,
      parameters: [since_date, until_date]
    })

    for (const row of results) {
      const date_str =
        row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : String(row.date).split('T')[0]

      // Convert values to Numbers
      const input_tokens = Number(row.input_tokens || 0)
      const output_tokens = Number(row.output_tokens || 0)
      const cache_creation_tokens = Number(row.cache_creation_tokens || 0)
      const cache_read_tokens = Number(row.cache_read_tokens || 0)

      token_by_date.set(date_str, {
        activity_token_usage:
          input_tokens +
          output_tokens +
          cache_creation_tokens +
          cache_read_tokens
      })
    }
  } catch (error) {
    log(`Failed to get token usage from SQLite: ${error.message}`)
  }

  return token_by_date
}

/**
 * Get list of thread directories
 * @returns {Promise<Array<string>>} Array of thread directory paths
 */
async function get_thread_directories() {
  const threads_path = path.join(config.user_base_directory, 'thread')

  try {
    const entries = await fs.readdir(threads_path, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => path.join(threads_path, entry.name))
  } catch (error) {
    log(`Failed to read thread directories: ${error.message}`)
    return []
  }
}

/**
 * Parse timeline file for file edit activity
 * @param {string} timeline_path Path to timeline.jsonl
 * @param {string} since_date ISO date string (YYYY-MM-DD)
 * @param {string} until_date ISO date string (YYYY-MM-DD)
 * @returns {Promise<Map<string, Object>>} Map of date -> edit metrics
 */
async function parse_timeline_for_edits({
  timeline_path,
  since_date,
  until_date
}) {
  const edit_by_date = new Map()

  try {
    const timeline = await read_timeline_jsonl_or_default({
      timeline_path,
      default_value: []
    })

    if (!Array.isArray(timeline)) {
      return edit_by_date
    }

    for (const entry of timeline) {
      if (entry.type !== 'tool_call') continue
      if (!entry.timestamp) continue

      const tool_name = entry.content?.tool_name
      if (tool_name !== 'Edit' && tool_name !== 'Write') continue

      const entry_date = entry.timestamp.split('T')[0]
      if (entry_date < since_date || entry_date > until_date) continue

      if (!edit_by_date.has(entry_date)) {
        edit_by_date.set(entry_date, {
          activity_thread_edits: 0,
          activity_thread_lines_changed: 0
        })
      }

      const date_metrics = edit_by_date.get(entry_date)
      date_metrics.activity_thread_edits += 1

      // Calculate lines changed
      const params = entry.content?.tool_parameters
      if (tool_name === 'Edit' && params) {
        const old_length = params.old_string?.length || 0
        const new_length = params.new_string?.length || 0
        // Approximate lines by character count / 80
        const char_diff = Math.abs(new_length - old_length)
        date_metrics.activity_thread_lines_changed += Math.ceil(char_diff / 80)
      } else if (tool_name === 'Write' && params) {
        const content_length = params.content?.length || 0
        // Approximate lines by character count / 80
        date_metrics.activity_thread_lines_changed += Math.ceil(
          content_length / 80
        )
      }
    }
  } catch (error) {
    // Timeline file may not exist or be invalid, skip silently
  }

  return edit_by_date
}

/**
 * Aggregate thread activity from all threads
 * @param {Object} params Parameters
 * @param {number} [params.days=365] Number of trailing days to include
 * @returns {Promise<Array<Object>>} Array of daily activity objects
 */
export async function aggregate_thread_activity({ days = 365 } = {}) {
  const until_date = new Date()
  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)

  const since_str = since_date.toISOString().split('T')[0]
  const until_str = until_date.toISOString().split('T')[0]

  log(`Aggregating thread activity from ${since_str} to ${until_str}`)

  // Get token usage from SQLite
  const token_activity = await get_token_usage_by_date({
    since_date: since_str,
    until_date: until_str
  })

  // Get edit activity from timeline files
  const thread_dirs = await get_thread_directories()
  log(`Found ${thread_dirs.length} thread directories`)

  const combined_activity = new Map()

  // Initialize with token activity
  for (const [date, metrics] of token_activity) {
    combined_activity.set(date, {
      date,
      activity_token_usage: metrics.activity_token_usage,
      activity_thread_edits: 0,
      activity_thread_lines_changed: 0
    })
  }

  // Aggregate edit activity from timelines
  for (const thread_dir of thread_dirs) {
    const timeline_path = path.join(thread_dir, 'timeline.jsonl')
    const edit_activity = await parse_timeline_for_edits({
      timeline_path,
      since_date: since_str,
      until_date: until_str
    })

    for (const [date, metrics] of edit_activity) {
      if (!combined_activity.has(date)) {
        combined_activity.set(date, {
          date,
          activity_token_usage: 0,
          activity_thread_edits: 0,
          activity_thread_lines_changed: 0
        })
      }

      const combined = combined_activity.get(date)
      combined.activity_thread_edits += metrics.activity_thread_edits
      combined.activity_thread_lines_changed +=
        metrics.activity_thread_lines_changed
    }
  }

  // Convert to sorted array
  const result = Array.from(combined_activity.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  log(`Aggregated thread activity for ${result.length} days`)
  return result
}
