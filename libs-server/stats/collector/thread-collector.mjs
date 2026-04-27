/**
 * Thread Metrics Collector
 *
 * Collects thread counts by state and total token usage.
 */

import debug from 'debug'

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
const log = debug('stats:collector:thread')

export async function collect_thread_metrics({ snapshot_date }) {
  const metrics = []

  // Thread counts by state
  const state_rows = await execute_sqlite_query({
    query:
      'SELECT thread_state, COUNT(*) as cnt FROM threads GROUP BY thread_state'
  })

  let total_threads = 0
  for (const row of state_rows) {
    const count = Number(row.cnt)
    total_threads += count
    metrics.push({
      snapshot_date,
      category: 'threads',
      metric_name: 'thread_count',
      metric_value: count,
      unit: 'count',
      dimensions: { state: row.thread_state }
    })
  }

  metrics.push({
    snapshot_date,
    category: 'threads',
    metric_name: 'thread_count',
    metric_value: total_threads,
    unit: 'count',
    dimensions: {}
  })

  // Total tokens
  const token_rows = await execute_sqlite_query({
    query: `
      SELECT
        COALESCE(SUM(CAST(total_tokens AS BIGINT)), 0) as total_tokens,
        COALESCE(SUM(CAST(cumulative_input_tokens AS BIGINT)), 0) as cumulative_input_tokens,
        COALESCE(SUM(CAST(cumulative_output_tokens AS BIGINT)), 0) as cumulative_output_tokens
      FROM threads
    `
  })

  if (token_rows.length > 0) {
    metrics.push({
      snapshot_date,
      category: 'threads',
      metric_name: 'total_tokens',
      metric_value: Number(token_rows[0].total_tokens),
      unit: 'tokens',
      dimensions: {}
    })
    metrics.push({
      snapshot_date,
      category: 'threads',
      metric_name: 'cumulative_input_tokens',
      metric_value: Number(token_rows[0].cumulative_input_tokens),
      unit: 'tokens',
      dimensions: {}
    })
    metrics.push({
      snapshot_date,
      category: 'threads',
      metric_name: 'cumulative_output_tokens',
      metric_value: Number(token_rows[0].cumulative_output_tokens),
      unit: 'tokens',
      dimensions: {}
    })
  }

  log('Collected %d thread metrics', metrics.length)
  return metrics
}
