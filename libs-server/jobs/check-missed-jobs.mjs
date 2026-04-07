import debug from 'debug'
import { CronExpressionParser } from 'cron-parser'

import { load_all_jobs, save_job } from './report-job.mjs'
import { get_all } from '#libs-server/extension/capability-registry.mjs'
import { parse_interval_ms } from './job-utils.mjs'
const log = debug('jobs:missed')

const MIN_GRACE_MS = 5 * 60 * 1000 // 5 minutes
const GRACE_MULTIPLIER = 1.5

/**
 * Calculate the grace period for a job based on its schedule
 */
const calculate_grace_ms = ({ schedule, schedule_type }) => {
  try {
    if (schedule_type === 'expr') {
      const cron = CronExpressionParser.parse(schedule)
      const next = cron.next().toDate()
      const after = cron.next().toDate()
      const interval_ms = after.getTime() - next.getTime()
      return Math.max(interval_ms * GRACE_MULTIPLIER, MIN_GRACE_MS)
    }

    if (schedule_type === 'every') {
      const interval_ms = parse_interval_ms(schedule)
      if (interval_ms) {
        return Math.max(interval_ms * GRACE_MULTIPLIER, MIN_GRACE_MS)
      }
    }
  } catch (error) {
    log(
      'Error calculating grace period for schedule %s: %s',
      schedule,
      error.message
    )
  }

  return MIN_GRACE_MS
}

/**
 * Calculate when the last execution should have occurred
 */
const get_expected_last_run = ({
  schedule,
  schedule_type,
  last_execution_timestamp
}) => {
  try {
    if (schedule_type === 'expr') {
      const cron = CronExpressionParser.parse(schedule, {
        currentDate: new Date()
      })
      return cron.prev().toDate()
    }

    if (schedule_type === 'every' && last_execution_timestamp) {
      const interval_ms = parse_interval_ms(schedule)
      if (interval_ms) {
        return new Date(
          new Date(last_execution_timestamp).getTime() + interval_ms
        )
      }
    }
  } catch (error) {
    log('Error calculating expected run for %s: %s', schedule, error.message)
  }

  return null
}

/**
 * Check all jobs for missed executions and send notifications
 *
 * @returns {Array<Object>} Array of missed job entries
 */
export const check_missed_jobs = async () => {
  const jobs = await load_all_jobs()
  const missed = []
  const now = new Date()

  for (const job of jobs) {
    if (!job.schedule || !job.schedule_type) {
      continue
    }

    const expected_run = get_expected_last_run({
      schedule: job.schedule,
      schedule_type: job.schedule_type,
      last_execution_timestamp: job.last_execution?.timestamp
    })

    if (!expected_run) {
      continue
    }

    const last_run = job.last_execution?.timestamp
      ? new Date(job.last_execution.timestamp)
      : null

    // Job ran after expected time -- not missed
    if (last_run && last_run >= expected_run) {
      continue
    }

    const grace_ms = calculate_grace_ms({
      schedule: job.schedule,
      schedule_type: job.schedule_type
    })

    const deadline = new Date(expected_run.getTime() + grace_ms)

    if (now < deadline) {
      continue
    }

    // Check duplicate suppression
    if (job.last_alerted_at) {
      const alerted_at = new Date(job.last_alerted_at)
      if (alerted_at >= expected_run) {
        continue
      }
    }

    log(
      'Missed execution detected: %s (expected: %s, last: %s)',
      job.job_id,
      expected_run.toISOString(),
      last_run?.toISOString() || 'never'
    )

    missed.push({
      job_id: job.job_id,
      source: job.source,
      project: job.project,
      schedule: job.schedule,
      expected_run: expected_run.toISOString(),
      last_run: last_run?.toISOString() || null
    })

    // Send notification and update suppression timestamp
    const channels = get_all('notification-channel')
    const results = await Promise.allSettled(
      channels.map((channel) =>
        channel.notify_missed({
          job_id: job.job_id,
          name: job.name,
          source: job.source,
          project: job.project,
          schedule: job.schedule,
          last_execution_timestamp: job.last_execution?.timestamp
        })
      )
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        log(
          'Error alerting missed job %s: %s',
          job.job_id,
          result.reason?.message
        )
      }
    }

    try {
      job.last_alerted_at = now.toISOString()
      job.updated_at = now.toISOString()
      await save_job({ job_id: job.job_id, data: job })
    } catch (error) {
      log('Error saving missed job %s: %s', job.job_id, error.message)
    }
  }

  if (missed.length > 0) {
    log('Found %d missed job(s)', missed.length)
  }

  return missed
}
