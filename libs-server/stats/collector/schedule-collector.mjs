/**
 * Schedule Metrics Collector
 *
 * Collects scheduled command counts and job success/failure rates.
 */

import debug from 'debug'

import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { load_all_jobs } from '#libs-server/jobs/report-job.mjs'

const log = debug('stats:collector:schedule')

export async function collect_schedule_metrics({ snapshot_date }) {
  const metrics = []

  // Scheduled command counts by enabled status
  const schedule_rows = await execute_sqlite_query({
    query: `
      SELECT
        CASE
          WHEN json_extract(frontmatter, '$.enabled') IN ('true', '1', 1) THEN 'true'
          ELSE 'false'
        END as enabled,
        COUNT(*) as cnt
      FROM entities
      WHERE type = 'scheduled-command'
      GROUP BY 1
    `
  })

  let total_schedules = 0
  for (const row of schedule_rows) {
    const count = Number(row.cnt)
    total_schedules += count
    metrics.push({
      snapshot_date,
      category: 'schedules',
      metric_name: 'scheduled_command_count',
      metric_value: count,
      unit: 'count',
      dimensions: { enabled: row.enabled }
    })
  }

  metrics.push({
    snapshot_date,
    category: 'schedules',
    metric_name: 'scheduled_command_count',
    metric_value: total_schedules,
    unit: 'count',
    dimensions: {}
  })

  // Job success/failure rates from job tracker
  try {
    const jobs = await load_all_jobs()
    let success_count = 0
    let failure_count = 0

    const thirty_days_ago = new Date()
    thirty_days_ago.setDate(thirty_days_ago.getDate() - 30)

    for (const job of jobs) {
      const stats = job.stats
      if (!stats) continue

      // Count recent successes and failures
      if (
        stats.last_success &&
        new Date(stats.last_success) >= thirty_days_ago
      ) {
        success_count += stats.success_count || 0
      }
      if (
        stats.last_failure &&
        new Date(stats.last_failure) >= thirty_days_ago
      ) {
        failure_count += stats.failure_count || 0
      }
    }

    const total = success_count + failure_count
    const rate =
      total > 0 ? Math.round((success_count / total) * 1000) / 10 : 100

    metrics.push({
      snapshot_date,
      category: 'schedules',
      metric_name: 'job_success_rate_30d',
      metric_value: rate,
      unit: 'percent',
      dimensions: {}
    })
    metrics.push({
      snapshot_date,
      category: 'schedules',
      metric_name: 'job_failure_count_30d',
      metric_value: failure_count,
      unit: 'count',
      dimensions: {}
    })
  } catch (err) {
    log('Failed to collect job stats: %s', err.message)
  }

  log('Collected %d schedule metrics', metrics.length)
  return metrics
}
