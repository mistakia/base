/**
 * Task Metrics Collector
 *
 * Collects task counts by status and creation/completion rates.
 */

import debug from 'debug'

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

const log = debug('stats:collector:task')

export async function collect_task_metrics({ snapshot_date }) {
  const metrics = []

  // Task counts by status
  const status_rows = await execute_sqlite_query({
    query: `
      SELECT json_extract(frontmatter, '$.status') as status, COUNT(*) as cnt
      FROM entities
      WHERE type = 'task' AND json_extract(frontmatter, '$.status') IS NOT NULL
      GROUP BY status
    `
  })

  let total_tasks = 0
  for (const row of status_rows) {
    const count = Number(row.cnt)
    total_tasks += count
    metrics.push({
      snapshot_date,
      category: 'tasks',
      metric_name: 'task_count',
      metric_value: count,
      unit: 'count',
      dimensions: { status: row.status }
    })
  }

  metrics.push({
    snapshot_date,
    category: 'tasks',
    metric_name: 'task_count',
    metric_value: total_tasks,
    unit: 'count',
    dimensions: {}
  })

  // Tasks completed in last 30 days
  const completed_rows = await execute_sqlite_query({
    query: `
      SELECT COUNT(*) as cnt FROM entities
      WHERE type = 'task'
        AND json_extract(frontmatter, '$.finished_at') IS NOT NULL
        AND date(json_extract(frontmatter, '$.finished_at')) >= date('now', '-30 days')
    `
  })
  metrics.push({
    snapshot_date,
    category: 'tasks',
    metric_name: 'tasks_completed_30d',
    metric_value: Number(completed_rows[0]?.cnt || 0),
    unit: 'count',
    dimensions: {}
  })

  // Tasks created in last 30 days
  const created_rows = await execute_sqlite_query({
    query: `
      SELECT COUNT(*) as cnt FROM entities
      WHERE type = 'task'
        AND date(created_at) >= date('now', '-30 days')
    `
  })
  metrics.push({
    snapshot_date,
    category: 'tasks',
    metric_name: 'tasks_created_30d',
    metric_value: Number(created_rows[0]?.cnt || 0),
    unit: 'count',
    dimensions: {}
  })

  log('Collected %d task metrics', metrics.length)
  return metrics
}
