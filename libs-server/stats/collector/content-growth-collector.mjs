/**
 * Content Growth Metrics Collector
 *
 * Collects daily content creation rates: entities created and threads created.
 * Designed for Year One Review trend analysis. Git commits are tracked by
 * the git collector's commits_today metric.
 */

import debug from 'debug'

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

const log = debug('stats:collector:content-growth')

async function collect_entities_created({ snapshot_date }) {
  const metrics = []

  try {
    const rows = await execute_sqlite_query({
      query: `
        SELECT type, COUNT(*) as cnt FROM entities
        WHERE date(created_at) = ?
        GROUP BY type
      `,
      params: [snapshot_date]
    })

    let total = 0
    for (const row of rows) {
      const count = Number(row.cnt)
      total += count
      metrics.push({
        snapshot_date,
        category: 'content_growth',
        metric_name: 'entities_created_today',
        metric_value: count,
        unit: 'count',
        dimensions: { type: row.type }
      })
    }

    metrics.push({
      snapshot_date,
      category: 'content_growth',
      metric_name: 'entities_created_today',
      metric_value: total,
      unit: 'count',
      dimensions: {}
    })
  } catch (err) {
    log('Failed to collect entities created: %s', err.message)
  }

  return metrics
}

async function collect_threads_created({ snapshot_date }) {
  const metrics = []

  try {
    const rows = await execute_sqlite_query({
      query: `
        SELECT COUNT(*) as cnt FROM threads
        WHERE date(created_at) = ?
      `,
      params: [snapshot_date]
    })

    metrics.push({
      snapshot_date,
      category: 'content_growth',
      metric_name: 'threads_created_today',
      metric_value: Number(rows[0]?.cnt || 0),
      unit: 'count',
      dimensions: {}
    })
  } catch (err) {
    log('Failed to collect threads created: %s', err.message)
  }

  return metrics
}

export async function collect_content_growth_metrics({ snapshot_date }) {
  const results = await Promise.allSettled([
    collect_entities_created({ snapshot_date }),
    collect_threads_created({ snapshot_date })
  ])

  const metrics = []
  for (const r of results) {
    if (r.status === 'fulfilled') metrics.push(...r.value)
  }

  log('Collected %d content growth metrics', metrics.length)
  return metrics
}
