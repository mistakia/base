import debug from 'debug'
import { add_cli_job } from '#libs-server/cli-queue/queue.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { parse_schedule } from './parse-schedule.mjs'

const log = debug('schedule:trigger')

/**
 * Trigger a scheduled command by enqueuing it to the CLI queue
 * and updating the entity file with trigger timestamps
 * @param {Object} params
 * @param {Object} params.schedule - Schedule entity properties
 * @param {string} params.file_path - Absolute path to the schedule entity file
 * @returns {Promise<Object>} Result with job info and updated schedule
 */
export const trigger_schedule = async ({ schedule, file_path }) => {
  const now = new Date().toISOString()

  log(`Triggering schedule: ${schedule.title || schedule.command}`)

  try {
    // Enqueue command to CLI queue
    const job = await add_cli_job({
      command: schedule.command,
      tags: schedule.queue_tags || [],
      priority: schedule.queue_priority || 10,
      working_directory: schedule.working_directory,
      timeout_ms: schedule.timeout_ms,
      execution_mode: schedule.execution_mode,
      metadata: {
        schedule_title: schedule.title,
        schedule_entity_id: schedule.entity_id,
        triggered_at: now
      }
    })

    log(`Enqueued job ${job.id} for schedule ${schedule.title}`)

    // Read current entity to preserve content
    const read_result = await read_entity_from_filesystem({
      absolute_path: file_path
    })

    if (!read_result.success) {
      throw new Error(`Failed to read entity: ${read_result.error}`)
    }

    const { entity_properties, entity_content } = read_result

    // Update trigger timestamps
    const updated_properties = {
      ...entity_properties,
      last_triggered_at: now,
      updated_at: now
    }

    // Compute next trigger time for recurring schedules
    if (
      schedule.schedule_type === 'expr' ||
      schedule.schedule_type === 'every'
    ) {
      updated_properties.next_trigger_at = parse_schedule({
        schedule_type: schedule.schedule_type,
        schedule: schedule.schedule,
        timezone: schedule.timezone,
        last_triggered_at: now
      })
    } else if (schedule.schedule_type === 'at') {
      // For one-shot schedules, clear next_trigger_at
      // The schedule remains enabled but won't trigger again
      updated_properties.next_trigger_at = null
    }

    // Write updated entity back to filesystem
    await write_entity_to_filesystem({
      absolute_path: file_path,
      entity_properties: updated_properties,
      entity_type: 'scheduled-command',
      entity_content
    })

    log(
      `Updated schedule ${schedule.title}: next_trigger_at = ${updated_properties.next_trigger_at}`
    )

    return {
      success: true,
      job_id: job.id,
      last_triggered_at: now,
      next_trigger_at: updated_properties.next_trigger_at
    }
  } catch (error) {
    log(`Error triggering schedule ${schedule.title}: ${error.message}`)
    throw error
  }
}

export default trigger_schedule
