import debug from 'debug'

import {
  execute_duckdb_query,
  is_duckdb_initialized
} from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'

const log = debug('activity:task-stats')

/**
 * Get task summary statistics for 3d, 10d, and 30d periods
 * @returns {Promise<Object>} Summary stats with period breakdowns
 */
export async function get_task_summary_stats() {
  if (!is_duckdb_initialized()) {
    log('DuckDB not initialized, returning empty stats')
    return null
  }

  try {
    const now = new Date()
    const periods = [3, 10, 30]

    // Note: completions queries use a subquery to materialize the type='task'
    // filter before extracting frontmatter->>'finished_at'. DuckDB's optimizer
    // otherwise evaluates JSON extraction across all entity types, causing a
    // cast error on non-task frontmatter structures.
    const period_queries = periods.flatMap((p) => {
      const since = new Date(now)
      since.setDate(since.getDate() - p)
      const since_str = since.toISOString().split('T')[0]
      return [
        execute_duckdb_query({
          query: `
            SELECT COUNT(*) as count
            FROM entities
            WHERE type = 'task' AND created_at >= ?
          `,
          parameters: [since_str]
        }),
        execute_duckdb_query({
          query: `
            SELECT COUNT(*) as count
            FROM (
              SELECT frontmatter->>'finished_at' as finished_at_str
              FROM entities
              WHERE type = 'task' AND status = 'Completed'
            ) task_completions
            WHERE finished_at_str IS NOT NULL
              AND finished_at_str::TIMESTAMP >= ?::TIMESTAMP
          `,
          parameters: [since_str]
        })
      ]
    })

    const status_query = execute_duckdb_query({
      query: `
        SELECT status, COUNT(*) as count
        FROM entities
        WHERE type = 'task'
          AND status IS NOT NULL
          AND status != ''
          AND status NOT IN ('Completed', 'Abandoned')
          AND archived = false
        GROUP BY status
        ORDER BY count DESC
      `
    })

    const results = await Promise.all([...period_queries, status_query])

    const period_stats = {}
    for (let i = 0; i < periods.length; i++) {
      const created = Number(results[i * 2][0]?.count || 0)
      const completed = Number(results[i * 2 + 1][0]?.count || 0)
      period_stats[`${periods[i]}d`] = { created, completed }
    }

    const status_result = results[results.length - 1]
    const by_status = {}
    for (const row of status_result) {
      by_status[row.status] = Number(row.count || 0)
    }

    return {
      periods: period_stats,
      open_by_status: by_status
    }
  } catch (error) {
    log(`Failed to get task summary stats: ${error.message}`)
    return null
  }
}

/**
 * Get per-tag task statistics
 * @param {Object} [params] Parameters
 * @param {number} [params.days=90] Lookback period for created/completed counts
 * @returns {Promise<Array>} Array of tag stats sorted by staleness
 */
export async function get_task_stats_by_tag({ days = 90 } = {}) {
  if (!is_duckdb_initialized()) {
    log('DuckDB not initialized, returning empty tag stats')
    return []
  }

  try {
    const since = new Date()
    since.setDate(since.getDate() - days)
    const since_str = since.toISOString().split('T')[0]

    // Use a subquery to extract finished_at only from task entities,
    // preventing DuckDB from evaluating frontmatter JSON on non-task rows
    const result = await execute_duckdb_query({
      query: `
        SELECT
          et.tag_base_uri,
          COUNT(*) FILTER (
            WHERE e.status IS NOT NULL
              AND e.status != ''
              AND e.status NOT IN ('Completed', 'Abandoned')
              AND e.archived = false
          ) as open_count,
          COUNT(*) FILTER (
            WHERE e.status = 'Completed'
              AND e.finished_at_str IS NOT NULL
              AND e.finished_at_str::TIMESTAMP >= ?::TIMESTAMP
          ) as completed_in_period,
          COUNT(*) FILTER (
            WHERE e.created_at >= ?::TIMESTAMP
          ) as created_in_period,
          MAX(CASE
            WHEN e.status = 'Completed' AND e.finished_at_str IS NOT NULL
            THEN e.finished_at_str::TIMESTAMP
            ELSE NULL
          END) as last_completed_at
        FROM entity_tags et
        JOIN (
          SELECT base_uri, status, archived, created_at,
                 frontmatter->>'finished_at' as finished_at_str
          FROM entities
          WHERE type = 'task'
        ) e ON e.base_uri = et.entity_base_uri
        GROUP BY et.tag_base_uri
        HAVING COUNT(*) FILTER (
          WHERE e.status IS NOT NULL
            AND e.status != ''
            AND e.status NOT IN ('Completed', 'Abandoned')
            AND e.archived = false
        ) > 0
        ORDER BY last_completed_at ASC NULLS FIRST
      `,
      parameters: [since_str, since_str]
    })

    const now = new Date()
    return result.map((row) => {
      const last_completed = row.last_completed_at
        ? new Date(row.last_completed_at)
        : null
      const days_since_completion = last_completed
        ? Math.floor((now - last_completed) / (1000 * 60 * 60 * 24))
        : null

      return {
        tag: row.tag_base_uri,
        open_count: Number(row.open_count || 0),
        completed_in_period: Number(row.completed_in_period || 0),
        created_in_period: Number(row.created_in_period || 0),
        net_delta:
          Number(row.created_in_period || 0) -
          Number(row.completed_in_period || 0),
        days_since_completion,
        last_completed_at: last_completed?.toISOString() || null
      }
    })
  } catch (error) {
    log(`Failed to get task stats by tag: ${error.message}`)
    return []
  }
}

/**
 * Get weekly task completion series for sparkline
 * @param {Object} [params] Parameters
 * @param {number} [params.weeks=16] Number of trailing weeks
 * @returns {Promise<Array>} Array of { week, completed, created }
 */
export async function get_task_completion_series({ weeks = 16 } = {}) {
  if (!is_duckdb_initialized()) {
    log('DuckDB not initialized, returning empty series')
    return []
  }

  try {
    const since = new Date()
    since.setDate(since.getDate() - weeks * 7)
    const since_str = since.toISOString().split('T')[0]

    const [creation_rows, completion_rows] = await Promise.all([
      execute_duckdb_query({
        query: `
          SELECT
            DATE_TRUNC('week', created_at) as week,
            COUNT(*) as created
          FROM entities
          WHERE type = 'task' AND created_at >= ?
          GROUP BY DATE_TRUNC('week', created_at)
        `,
        parameters: [since_str]
      }),
      execute_duckdb_query({
        query: `
          SELECT
            DATE_TRUNC('week', finished_at_str::TIMESTAMP) as week,
            COUNT(*) as completed
          FROM (
            SELECT frontmatter->>'finished_at' as finished_at_str
            FROM entities
            WHERE type = 'task' AND status = 'Completed'
          ) task_completions
          WHERE finished_at_str IS NOT NULL
            AND finished_at_str::TIMESTAMP >= ?::TIMESTAMP
          GROUP BY DATE_TRUNC('week', finished_at_str::TIMESTAMP)
        `,
        parameters: [since_str]
      })
    ])

    // Merge by week
    const by_week = new Map()
    for (const row of creation_rows) {
      const week =
        row.week instanceof Date
          ? row.week.toISOString().split('T')[0]
          : String(row.week).split('T')[0]
      by_week.set(week, { week, created: Number(row.created || 0), completed: 0 })
    }
    for (const row of completion_rows) {
      const week =
        row.week instanceof Date
          ? row.week.toISOString().split('T')[0]
          : String(row.week).split('T')[0]
      if (by_week.has(week)) {
        by_week.get(week).completed = Number(row.completed || 0)
      } else {
        by_week.set(week, { week, created: 0, completed: Number(row.completed || 0) })
      }
    }

    return Array.from(by_week.values()).sort((a, b) =>
      a.week.localeCompare(b.week)
    )
  } catch (error) {
    log(`Failed to get task completion series: ${error.message}`)
    return []
  }
}
