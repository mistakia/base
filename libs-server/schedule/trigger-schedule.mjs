import debug from 'debug'
import { parse_schedule } from './parse-schedule.mjs'
import { write_schedule_trigger } from './schedule-state.mjs'
import { parse_interval_ms } from '#libs-server/jobs/job-utils.mjs'
import { CronExpressionParser } from 'cron-parser'

const log = debug('schedule:trigger')

const DEFAULT_AT_FRESHNESS_WINDOW_MS = 60 * 60 * 1000

const compute_default_freshness_window_ms = ({ schedule_type, schedule }) => {
  try {
    if (schedule_type === 'every') {
      const interval_ms = parse_interval_ms(schedule)
      if (interval_ms) return 2 * interval_ms
    }
    if (schedule_type === 'expr') {
      const cron = CronExpressionParser.parse(schedule)
      const a = cron.next().toDate().getTime()
      const b = cron.next().toDate().getTime()
      const interval_ms = b - a
      if (interval_ms > 0) return 2 * interval_ms
    }
  } catch (err) {
    log(
      `compute_default_freshness_window_ms parse failed (type=${schedule_type} schedule=${schedule}): ${err.message}`
    )
  }
  if (schedule_type === 'at') return DEFAULT_AT_FRESHNESS_WINDOW_MS
  return null
}

/**
 * Trigger a scheduled command by enqueuing it to the CLI queue
 * and recording the trigger timestamp in the state file
 * @param {Object} params
 * @param {Object} params.schedule - Schedule entity properties
 * @param {string} params.directory - Root scheduled-command directory (for state file)
 * @param {Function} params.add_job - Async function to enqueue a CLI job (e.g., add_cli_job)
 * @returns {Promise<Object>} Result with job info and trigger timestamps
 */
export const trigger_schedule = async ({ schedule, directory, add_job }) => {
  const now = new Date().toISOString()
  const now_ms = Date.now()

  log(`Triggering schedule: ${schedule.title || schedule.command}`)

  try {
    const requires = Array.isArray(schedule.requires) ? schedule.requires : []
    const mid_flight_check = Boolean(schedule.mid_flight_check)
    const freshness_window_ms =
      schedule.freshness_window_ms ??
      compute_default_freshness_window_ms({
        schedule_type: schedule.schedule_type,
        schedule: schedule.schedule
      })

    const scheduled_time_seconds = Math.floor(
      (schedule.next_trigger_at
        ? new Date(schedule.next_trigger_at).getTime()
        : now_ms) / 1000
    )

    const job_id = schedule.entity_id
      ? `sched:${schedule.entity_id}:${scheduled_time_seconds}`
      : undefined

    // Enqueue command to CLI queue
    const job = await add_job({
      command: schedule.command,
      tags: schedule.queue_tags || [],
      priority: schedule.queue_priority || 10,
      working_directory: schedule.working_directory,
      timeout_ms: schedule.timeout_ms,
      execution_mode: schedule.execution_mode,
      job_id,
      requires,
      mid_flight_check,
      freshness_window_ms,
      metadata: {
        schedule_title: schedule.title,
        schedule_entity_id: schedule.entity_id,
        schedule_expression: schedule.schedule,
        schedule_type: schedule.schedule_type,
        schedule_entity_uri: schedule.base_uri || null,
        triggered_at: now
      }
    })

    log(`Enqueued job ${job.id} for schedule ${schedule.title}`)

    // Write trigger timestamp to state file
    await write_schedule_trigger({
      directory,
      entity_id: schedule.entity_id,
      last_triggered_at: now
    })

    // Compute next trigger time for the response
    let next_trigger_at = null
    if (
      schedule.schedule_type === 'expr' ||
      schedule.schedule_type === 'every'
    ) {
      next_trigger_at = parse_schedule({
        schedule_type: schedule.schedule_type,
        schedule: schedule.schedule,
        timezone: schedule.timezone,
        last_triggered_at: now
      })
    }

    log(
      `Updated schedule ${schedule.title}: next_trigger_at = ${next_trigger_at}`
    )

    return {
      success: true,
      job_id: job.id,
      last_triggered_at: now,
      next_trigger_at
    }
  } catch (error) {
    log(`Error triggering schedule ${schedule.title}: ${error.message}`)
    throw error
  }
}

export default trigger_schedule
