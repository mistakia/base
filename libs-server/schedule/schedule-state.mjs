import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

const log = debug('schedule:state')

const STATE_FILENAME = '.schedule-state.json'

/**
 * Read schedule state from the state file
 * @param {Object} params
 * @param {string} params.directory - scheduled-command directory
 * @returns {Promise<Object>} Map of entity_id -> { last_triggered_at }
 */
export const read_schedule_state = async ({ directory }) => {
  const state_path = path.join(directory, STATE_FILENAME)

  try {
    const content = await fs.readFile(state_path, 'utf-8')
    const state = JSON.parse(content)
    log(`Read state for ${Object.keys(state).length} schedules`)
    return state
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('No state file found, returning empty state')
      return {}
    }
    log(`Error reading state file: ${error.message}`)
    return {}
  }
}

/**
 * Write a trigger timestamp for a schedule to the state file
 * @param {Object} params
 * @param {string} params.directory - scheduled-command directory
 * @param {string} params.entity_id - Entity ID of the schedule
 * @param {string} params.last_triggered_at - ISO timestamp of the trigger
 * @returns {Promise<void>}
 */
export const write_schedule_trigger = async ({
  directory,
  entity_id,
  last_triggered_at
}) => {
  const state_path = path.join(directory, STATE_FILENAME)

  // Read current state
  const state = await read_schedule_state({ directory })

  // Update entry
  state[entity_id] = { last_triggered_at }

  // Write atomically via temp file
  const tmp_path = `${state_path}.tmp`
  await fs.writeFile(tmp_path, JSON.stringify(state, null, 2) + '\n', 'utf-8')
  await fs.rename(tmp_path, state_path)

  log(`Updated state for ${entity_id}: last_triggered_at=${last_triggered_at}`)
}
