/**
 * Thread Metrics Collector
 *
 * Collects thread counts by state, total tokens, total cost, and data volume.
 */

import debug from 'debug'

import { execute_duckdb_query } from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'
import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'
import config from '#config'

const log = debug('stats:collector:thread')

export async function collect_thread_metrics({ snapshot_date }) {
  const metrics = []

  // Thread counts by state
  const state_rows = await execute_duckdb_query({
    query: 'SELECT thread_state, COUNT(*) as cnt FROM threads GROUP BY thread_state'
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

  // Total tokens and cost
  const token_rows = await execute_duckdb_query({
    query: `
      SELECT
        COALESCE(SUM(CAST(total_tokens AS BIGINT)), 0) as total_tokens,
        COALESCE(SUM(CAST(total_cost AS DOUBLE)), 0) as total_cost
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
      metric_name: 'total_cost_usd',
      metric_value: Number(token_rows[0].total_cost),
      unit: 'usd',
      dimensions: {}
    })
  }

  // Thread directory size
  try {
    const thread_dir = `${config.user_base_directory}/thread`
    const du_cmd = process.platform === 'darwin'
      ? `du -sk "${thread_dir}" | cut -f1`
      : `du -sb "${thread_dir}" | cut -f1`
    const { stdout } = await execute_shell_command(du_cmd, { timeout: 30000 })
    const raw_size = parseInt(stdout.trim(), 10)
    const size_bytes = process.platform === 'darwin' ? raw_size * 1024 : raw_size
    if (!isNaN(size_bytes)) {
      metrics.push({
        snapshot_date,
        category: 'threads',
        metric_name: 'thread_data_size',
        metric_value: size_bytes,
        unit: 'bytes',
        dimensions: {}
      })
    }
  } catch (err) {
    log('Failed to measure thread directory: %s', err.message)
  }

  log('Collected %d thread metrics', metrics.length)
  return metrics
}
