import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

const log = debug('schedule:state')

const STATE_FILENAME = '.schedule-state.json'

// Serialize state-file mutations per-directory so concurrent dispatcher
// evaluations (Promise.all in load_due_schedules) cannot lose updates via
// interleaved read-modify-write cycles. Atomic rename only protects file
// integrity, not against lost updates.
const write_queues = new Map()

const serialize_write = (state_path, fn) => {
  const previous = write_queues.get(state_path) || Promise.resolve()
  const next = previous.then(fn, fn)
  write_queues.set(
    state_path,
    next.finally(() => {
      if (write_queues.get(state_path) === next) write_queues.delete(state_path)
    })
  )
  return next
}

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
export const write_schedule_trigger = ({
  directory,
  entity_id,
  last_triggered_at
}) => {
  const state_path = path.join(directory, STATE_FILENAME)

  return serialize_write(state_path, async () => {
    const state = await read_schedule_state({ directory })
    state[entity_id] = { ...(state[entity_id] || {}), last_triggered_at }

    const tmp_path = `${state_path}.tmp`
    await fs.writeFile(tmp_path, JSON.stringify(state, null, 2) + '\n', 'utf-8')
    await fs.rename(tmp_path, state_path)

    log(
      `Updated state for ${entity_id}: last_triggered_at=${last_triggered_at}`
    )
  })
}

/**
 * Write a deferred record for a schedule to the state file without clobbering
 * existing fields (e.g., last_triggered_at).
 *
 * @param {Object} params
 * @param {string} params.directory - scheduled-command directory
 * @param {string} params.entity_id - Entity ID of the schedule
 * @param {Object} params.deferred - { at: ISO timestamp, missing: string[] }
 */
export const write_schedule_deferred = ({
  directory,
  entity_id,
  deferred
}) => {
  const state_path = path.join(directory, STATE_FILENAME)

  return serialize_write(state_path, async () => {
    const state = await read_schedule_state({ directory })
    state[entity_id] = { ...(state[entity_id] || {}), deferred }

    const tmp_path = `${state_path}.tmp`
    await fs.writeFile(tmp_path, JSON.stringify(state, null, 2) + '\n', 'utf-8')
    await fs.rename(tmp_path, state_path)

    log(`Updated deferred state for ${entity_id}: missing=${deferred?.missing}`)
  })
}
