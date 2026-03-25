/**
 * Entity Metrics Collector
 *
 * Collects entity counts by type and status, tag count, and relation count.
 */

import debug from 'debug'

import {
  query_tag_statistics_from_duckdb
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'
import { execute_duckdb_query } from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'

const log = debug('stats:collector:entity')

export async function collect_entity_metrics({ snapshot_date }) {
  const metrics = []

  // Entity counts by type
  const type_rows = await execute_duckdb_query({
    query: 'SELECT type, COUNT(*) as cnt FROM entities GROUP BY type'
  })

  let total_entities = 0
  for (const row of type_rows) {
    const count = Number(row.cnt)
    total_entities += count
    metrics.push({
      snapshot_date,
      category: 'entities',
      metric_name: 'entity_count',
      metric_value: count,
      unit: 'count',
      dimensions: { type: row.type }
    })
  }

  metrics.push({
    snapshot_date,
    category: 'entities',
    metric_name: 'entity_count',
    metric_value: total_entities,
    unit: 'count',
    dimensions: {}
  })

  // Task counts by status
  const status_rows = await execute_duckdb_query({
    query: `
      SELECT json_extract_string(frontmatter, '$.status') as status, COUNT(*) as cnt
      FROM entities
      WHERE type = 'task' AND json_extract_string(frontmatter, '$.status') IS NOT NULL
      GROUP BY status
    `
  })

  for (const row of status_rows) {
    metrics.push({
      snapshot_date,
      category: 'entities',
      metric_name: 'entity_count',
      metric_value: Number(row.cnt),
      unit: 'count',
      dimensions: { type: 'task', status: row.status }
    })
  }

  // Tag count
  const tag_stats = await query_tag_statistics_from_duckdb()
  metrics.push({
    snapshot_date,
    category: 'entities',
    metric_name: 'tag_count',
    metric_value: tag_stats.length,
    unit: 'count',
    dimensions: {}
  })

  // Relation count
  const relation_rows = await execute_duckdb_query({
    query: 'SELECT COUNT(*) as cnt FROM entity_relations'
  })
  metrics.push({
    snapshot_date,
    category: 'entities',
    metric_name: 'relation_count',
    metric_value: Number(relation_rows[0]?.cnt || 0),
    unit: 'count',
    dimensions: {}
  })

  log('Collected %d entity metrics', metrics.length)
  return metrics
}
