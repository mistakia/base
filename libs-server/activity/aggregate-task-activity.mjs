import debug from 'debug'

import {
  execute_duckdb_query,
  is_duckdb_initialized
} from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'

const log = debug('activity:task')

/**
 * Aggregate task activity from DuckDB entities table
 *
 * Uses separate queries for creations and completions. The completions query
 * uses a subquery to materialize the type='task' filter before applying
 * frontmatter JSON extraction, preventing DuckDB from evaluating
 * frontmatter->>'finished_at' on non-task entity rows (which causes a
 * JSON cast error due to incompatible frontmatter structures).
 *
 * @param {Object} params Parameters
 * @param {number} [params.days=365] Number of trailing days to include
 * @returns {Promise<Array<Object>>} Array of daily task activity objects
 */
export async function aggregate_task_activity({ days = 365 } = {}) {
  if (!is_duckdb_initialized()) {
    log('DuckDB not initialized, skipping task activity aggregation')
    return []
  }

  const until_date = new Date()
  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)

  const since_str = since_date.toISOString().split('T')[0]
  const until_str = until_date.toISOString().split('T')[0]

  log(`Aggregating task activity from ${since_str} to ${until_str}`)

  try {
    const [creation_rows, completion_rows] = await Promise.all([
      execute_duckdb_query({
        query: `
          SELECT CAST(created_at AS DATE) as date, COUNT(*) as count
          FROM entities
          WHERE type = 'task' AND created_at >= ? AND created_at <= ?
          GROUP BY CAST(created_at AS DATE)
        `,
        parameters: [since_str, until_str]
      }),
      execute_duckdb_query({
        query: `
          SELECT
            CAST(finished_at_str::TIMESTAMP AS DATE) as date,
            COUNT(*) as count
          FROM (
            SELECT frontmatter->>'finished_at' as finished_at_str
            FROM entities
            WHERE type = 'task' AND status = 'Completed'
          ) task_completions
          WHERE finished_at_str IS NOT NULL
            AND finished_at_str::TIMESTAMP >= ?::TIMESTAMP
            AND finished_at_str::TIMESTAMP <= ?::TIMESTAMP
          GROUP BY CAST(finished_at_str::TIMESTAMP AS DATE)
        `,
        parameters: [since_str, until_str]
      })
    ])

    // Merge creations and completions by date
    const by_date = new Map()

    for (const row of creation_rows) {
      const date =
        row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : String(row.date).split('T')[0]
      by_date.set(date, {
        date,
        tasks_created: Number(row.count || 0),
        tasks_completed: 0
      })
    }

    for (const row of completion_rows) {
      const date =
        row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : String(row.date).split('T')[0]
      if (by_date.has(date)) {
        by_date.get(date).tasks_completed = Number(row.count || 0)
      } else {
        by_date.set(date, {
          date,
          tasks_created: 0,
          tasks_completed: Number(row.count || 0)
        })
      }
    }

    const result = Array.from(by_date.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    )

    log(`Aggregated task activity for ${result.length} days`)
    return result
  } catch (error) {
    log(`Failed to aggregate task activity from DuckDB: ${error.message}`)
    return []
  }
}
