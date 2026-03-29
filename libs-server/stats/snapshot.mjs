/**
 * Stats Snapshot Orchestrator
 *
 * Runs all metric collectors and bulk-inserts results to PostgreSQL.
 */

import debug from 'debug'

import { collect_entity_metrics } from './collector/entity-collector.mjs'
import { collect_git_metrics } from './collector/git-collector.mjs'
import { collect_thread_metrics } from './collector/thread-collector.mjs'
import { collect_task_metrics } from './collector/task-collector.mjs'
import { collect_storage_metrics } from './collector/storage-collector.mjs'
import { collect_service_metrics } from './collector/service-collector.mjs'
import { collect_schedule_metrics } from './collector/schedule-collector.mjs'
import { upsert_metrics } from './database.mjs'

const log = debug('stats:snapshot')

const ALL_COLLECTORS = {
  entities: collect_entity_metrics,
  git: collect_git_metrics,
  threads: collect_thread_metrics,
  tasks: collect_task_metrics,
  storage: collect_storage_metrics,
  services: collect_service_metrics,
  schedules: collect_schedule_metrics
}

/**
 * Run a stats snapshot: collect metrics from all (or selected) collectors
 * and upsert them into PostgreSQL.
 */
export async function run_stats_snapshot({
  snapshot_date,
  config,
  pool,
  collectors,
  dry_run = false
}) {
  const date_str = snapshot_date || new Date().toISOString().split('T')[0]

  const selected =
    collectors && collectors.length > 0
      ? Object.fromEntries(
          Object.entries(ALL_COLLECTORS).filter(([name]) =>
            collectors.includes(name)
          )
        )
      : ALL_COLLECTORS

  log(
    'Running snapshot for %s with collectors: %s',
    date_str,
    Object.keys(selected).join(', ')
  )

  const collector_names = Object.keys(selected)
  const results = await Promise.allSettled(
    Object.entries(selected).map(async ([name, collect_fn]) => {
      const start = Date.now()
      const args = { snapshot_date: date_str, config, pool }
      const metrics = await collect_fn(args)
      const duration_ms = Date.now() - start
      log('Collector %s: %d metrics in %dms', name, metrics.length, duration_ms)
      return { name, metrics, duration_ms }
    })
  )

  const all_metrics = []
  const summary = { collectors: {}, errors: [] }

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      const { name, metrics, duration_ms } = result.value
      all_metrics.push(...metrics)
      summary.collectors[name] = { count: metrics.length, duration_ms }
    } else {
      const name = collector_names[i]
      const error_msg = result.reason?.message || String(result.reason)
      summary.errors.push(`${name}: ${error_msg}`)
      log('Collector %s failed: %s', name, error_msg)
    }
  }

  summary.total_metrics = all_metrics.length
  summary.snapshot_date = date_str
  summary.dry_run = dry_run

  if (!dry_run && all_metrics.length > 0 && pool) {
    // Batch upsert in chunks of 500 to avoid parameter limit
    const batch_size = 500
    for (let i = 0; i < all_metrics.length; i += batch_size) {
      const batch = all_metrics.slice(i, i + batch_size)
      await upsert_metrics({ pool, metrics: batch })
    }
    log('Upserted %d metrics for %s', all_metrics.length, date_str)
  }

  return { summary, metrics: dry_run ? all_metrics : undefined }
}
