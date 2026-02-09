import debug from 'debug'
import { list_files_recursive } from '#libs-server/repository/filesystem/list-files-recursive.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { parse_schedule } from './parse-schedule.mjs'

const log = debug('schedule:load')

/**
 * Load all scheduled-command entities from a directory recursively
 * @param {Object} params
 * @param {string} params.directory - Base directory to scan for scheduled-command entities
 * @returns {Promise<Object[]>} Array of schedule objects with entity properties and file paths
 */
export const load_schedules = async ({ directory }) => {
  log(`Loading schedules from ${directory}`)

  try {
    // Find all markdown files in the directory
    const files = await list_files_recursive({
      directory,
      file_extension: '.md',
      absolute_paths: true
    })

    log(`Found ${files.length} markdown files`)

    // Read all files in parallel
    const read_results = await Promise.all(
      files.map(async (file_path) => {
        const result = await read_entity_from_filesystem({
          absolute_path: file_path
        })
        return { file_path, result }
      })
    )

    const schedules = []

    for (const { file_path, result } of read_results) {
      if (!result.success) {
        log(`Failed to read ${file_path}: ${result.error}`)
        continue
      }

      const { entity_properties } = result

      // Only include scheduled-command entities
      if (entity_properties.type !== 'scheduled-command') {
        continue
      }

      // Determine if schedule is enabled
      const enabled = entity_properties.enabled !== false

      // Parse next trigger time if not already set
      let next_trigger_at = entity_properties.next_trigger_at

      if (!next_trigger_at && enabled) {
        next_trigger_at = parse_schedule({
          schedule_type: entity_properties.schedule_type,
          schedule: entity_properties.schedule,
          timezone: entity_properties.timezone,
          last_triggered_at: entity_properties.last_triggered_at
        })
      }

      schedules.push({
        ...entity_properties,
        file_path,
        next_trigger_at,
        enabled
      })
    }

    log(`Loaded ${schedules.length} scheduled-command entities`)
    return schedules
  } catch (error) {
    log(`Error loading schedules: ${error.message}`)
    throw error
  }
}

/**
 * Load schedules that are due for execution
 * @param {Object} params
 * @param {string} params.directory - Base directory to scan for scheduled-command entities
 * @param {Date} [params.now] - Current time (defaults to new Date())
 * @returns {Promise<Object[]>} Array of due schedule objects
 */
export const load_due_schedules = async ({ directory, now = new Date() }) => {
  const schedules = await load_schedules({ directory })
  const current_time = now.toISOString()

  const due_schedules = schedules.filter((schedule) => {
    if (!schedule.enabled) {
      return false
    }

    if (!schedule.next_trigger_at) {
      return false
    }

    return schedule.next_trigger_at <= current_time
  })

  log(
    `Found ${due_schedules.length} due schedules out of ${schedules.length} total`
  )
  return due_schedules
}

export default load_schedules
