/**
 * Timeline Backstop Metrics Collector
 *
 * Drains the in-memory schema_version backstop counter on each snapshot.
 */

import debug from 'debug'

import { read_and_reset_timeline_backstop_counter } from '#libs-server/threads/timeline-backstop-counter.mjs'

const log = debug('stats:collector:timeline-backstop')

export async function collect_timeline_backstop_metrics({ snapshot_date }) {
  const count = read_and_reset_timeline_backstop_counter()

  log('Collected timeline backstop count: %d', count)

  return [
    {
      snapshot_date,
      category: 'timeline',
      metric_name: 'schema_version_backstop_count',
      metric_value: count,
      unit: 'count',
      dimensions: {}
    }
  ]
}
