/**
 * Knowledge Base Health Metrics Collector
 *
 * Collects graph connectivity and work hygiene metrics.
 */

import debug from 'debug'

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

const log = debug('stats:collector:knowledge-base')

async function collect_graph_connectivity({ snapshot_date }) {
  const metrics = []

  // Orphan entities: entities with no relations (neither source nor target)
  try {
    const orphan_rows = await execute_sqlite_query({
      query: `
        SELECT COUNT(*) as cnt FROM entities e
        WHERE NOT EXISTS (
          SELECT 1 FROM entity_relations er
          WHERE er.source_base_uri = e.base_uri OR er.target_base_uri = e.base_uri
        )
        AND e.type NOT IN ('tag', 'role', 'identity')
      `
    })
    metrics.push({
      snapshot_date,
      category: 'knowledge_base',
      metric_name: 'orphan_entity_count',
      metric_value: Number(orphan_rows[0]?.cnt || 0),
      unit: 'count',
      dimensions: {}
    })
  } catch (err) {
    log('Failed to collect orphan entities: %s', err.message)
  }

  // Entities missing description
  try {
    const missing_desc_rows = await execute_sqlite_query({
      query: `
        SELECT COUNT(*) as cnt FROM entities
        WHERE (description IS NULL OR description = '')
          AND type NOT IN ('tag')
      `
    })
    metrics.push({
      snapshot_date,
      category: 'knowledge_base',
      metric_name: 'entities_missing_description',
      metric_value: Number(missing_desc_rows[0]?.cnt || 0),
      unit: 'count',
      dimensions: {}
    })
  } catch (err) {
    log('Failed to collect missing descriptions: %s', err.message)
  }

  // Entities missing tags
  try {
    const missing_tags_rows = await execute_sqlite_query({
      query: `
        SELECT COUNT(*) as cnt FROM entities e
        WHERE NOT EXISTS (
          SELECT 1 FROM entity_tags et WHERE et.entity_base_uri = e.base_uri
        )
        AND e.type NOT IN ('tag', 'role', 'identity')
      `
    })
    metrics.push({
      snapshot_date,
      category: 'knowledge_base',
      metric_name: 'entities_missing_tags',
      metric_value: Number(missing_tags_rows[0]?.cnt || 0),
      unit: 'count',
      dimensions: {}
    })
  } catch (err) {
    log('Failed to collect missing tags: %s', err.message)
  }

  return metrics
}

async function collect_work_hygiene({ snapshot_date }) {
  const metrics = []

  // Stale active threads (active with no update in 7+ days)
  try {
    const stale_rows = await execute_sqlite_query({
      query: `
        SELECT COUNT(*) as cnt FROM threads
        WHERE thread_state = 'active'
          AND date(updated_at) < date('now', '-7 days')
      `
    })
    metrics.push({
      snapshot_date,
      category: 'knowledge_base',
      metric_name: 'stale_active_threads',
      metric_value: Number(stale_rows[0]?.cnt || 0),
      unit: 'count',
      dimensions: {}
    })
  } catch (err) {
    log('Failed to collect stale threads: %s', err.message)
  }

  // Tasks without status
  try {
    const no_status_rows = await execute_sqlite_query({
      query: `
        SELECT COUNT(*) as cnt FROM entities
        WHERE type = 'task'
          AND (status IS NULL OR status = '')
      `
    })
    metrics.push({
      snapshot_date,
      category: 'knowledge_base',
      metric_name: 'tasks_without_status',
      metric_value: Number(no_status_rows[0]?.cnt || 0),
      unit: 'count',
      dimensions: {}
    })
  } catch (err) {
    log('Failed to collect tasks without status: %s', err.message)
  }

  // Average age of in-progress tasks
  try {
    const age_rows = await execute_sqlite_query({
      query: `
        SELECT AVG(
          julianday('now') - julianday(json_extract(frontmatter, '$.started_at'))
        ) as avg_days
        FROM entities
        WHERE type = 'task'
          AND status = 'In Progress'
          AND json_extract(frontmatter, '$.started_at') IS NOT NULL
      `
    })
    const avg_days = age_rows[0]?.avg_days
    if (avg_days != null && !isNaN(Number(avg_days))) {
      metrics.push({
        snapshot_date,
        category: 'knowledge_base',
        metric_name: 'tasks_in_progress_age_avg_days',
        metric_value: Math.round(Number(avg_days) * 10) / 10,
        unit: 'days',
        dimensions: {}
      })
    }
  } catch (err) {
    log('Failed to collect in-progress task age: %s', err.message)
  }

  // Draft task count
  try {
    const draft_rows = await execute_sqlite_query({
      query: `
        SELECT COUNT(*) as cnt FROM entities
        WHERE type = 'task' AND status = 'Draft'
      `
    })
    metrics.push({
      snapshot_date,
      category: 'knowledge_base',
      metric_name: 'draft_task_count',
      metric_value: Number(draft_rows[0]?.cnt || 0),
      unit: 'count',
      dimensions: {}
    })
  } catch (err) {
    log('Failed to collect draft task count: %s', err.message)
  }

  return metrics
}

export async function collect_knowledge_base_metrics({ snapshot_date }) {
  const results = await Promise.allSettled([
    collect_graph_connectivity({ snapshot_date }),
    collect_work_hygiene({ snapshot_date })
  ])

  const metrics = []
  for (const r of results) {
    if (r.status === 'fulfilled') metrics.push(...r.value)
  }

  log('Collected %d knowledge base metrics', metrics.length)
  return metrics
}
