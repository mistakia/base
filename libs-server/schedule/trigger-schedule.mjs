import debug from 'debug'
import { parse_schedule } from './parse-schedule.mjs'
import { write_schedule_trigger } from './schedule-state.mjs'

const log = debug('schedule:trigger')

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

  log(`Triggering schedule: ${schedule.title || schedule.command}`)

  try {
    // Enqueue command to CLI queue
    const job = await add_job({
      command: schedule.command,
      tags: schedule.queue_tags || [],
      priority: schedule.queue_priority || 10,
      working_directory: schedule.working_directory,
      timeout_ms: schedule.timeout_ms,
      execution_mode: schedule.execution_mode,
      metadata: {
        schedule_title: schedule.title,
        schedule_entity_id: schedule.entity_id,
        schedule_expression: schedule.schedule,
        schedule_type: schedule.schedule_type,
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
