import debug from 'debug'
import path from 'path'
import { pathToFileURL } from 'url'
import config from '#config'

import { load_due_schedules } from '#libs-server/schedule/load-schedules.mjs'
import { trigger_schedule } from '#libs-server/schedule/trigger-schedule.mjs'

const log = debug('schedule:processor')

// Configuration
const POLL_INTERVAL_MS = 60000 // 60 seconds

let poll_timer = null
let is_running = false

/**
 * Get the scheduled-command directory path
 * @returns {string} Absolute path to scheduled-command directory
 */
const get_schedule_directory = () => {
  const user_base = config.user_base_directory
  if (!user_base) {
    throw new Error('user_base_directory not configured')
  }
  return path.join(user_base, 'scheduled-command')
}

/**
 * Process due schedules
 * @returns {Promise<Object>} Processing results
 */
const process_due_schedules = async () => {
  const results = {
    processed: 0,
    errors: 0,
    schedules: []
  }

  try {
    const directory = get_schedule_directory()
    const due_schedules = await load_due_schedules({ directory })

    log(`Found ${due_schedules.length} due schedules`)

    for (const schedule of due_schedules) {
      try {
        const result = await trigger_schedule({
          schedule,
          file_path: schedule.file_path
        })

        results.processed++
        results.schedules.push({
          title: schedule.title,
          job_id: result.job_id,
          next_trigger_at: result.next_trigger_at
        })

        log(`Triggered: ${schedule.title} -> job ${result.job_id}`)
      } catch (error) {
        results.errors++
        log(`Error triggering ${schedule.title}: ${error.message}`)
      }
    }
  } catch (error) {
    log(`Error processing schedules: ${error.message}`)
    results.errors++
  }

  return results
}

/**
 * Polling loop
 */
const poll = async () => {
  if (!is_running) {
    return
  }

  log('Polling for due schedules...')

  try {
    const results = await process_due_schedules()

    if (results.processed > 0 || results.errors > 0) {
      log(
        `Poll complete: ${results.processed} processed, ${results.errors} errors`
      )
    }
  } catch (error) {
    log(`Poll error: ${error.message}`)
  }

  // Schedule next poll
  if (is_running) {
    poll_timer = setTimeout(poll, POLL_INTERVAL_MS)
  }
}

/**
 * Start the schedule processor
 * @returns {Object} Processor control object
 */
export const start_schedule_processor = () => {
  if (is_running) {
    log('Schedule processor already running')
    return { already_running: true }
  }

  is_running = true
  log('Starting schedule processor')
  log(`Poll interval: ${POLL_INTERVAL_MS}ms`)
  log(`Schedule directory: ${get_schedule_directory()}`)

  // Start polling immediately
  poll()

  return {
    stop: stop_schedule_processor
  }
}

/**
 * Stop the schedule processor
 * @returns {Promise<void>}
 */
export const stop_schedule_processor = async () => {
  log('Stopping schedule processor')
  is_running = false

  if (poll_timer) {
    clearTimeout(poll_timer)
    poll_timer = null
  }

  log('Schedule processor stopped')
}

// Standalone Execution
const is_main_module = () => {
  // Check if running as PM2 app
  const pm2_app_name = process.env.name
  if (pm2_app_name === 'schedule-processor') {
    return true
  }

  // Check if this is the main module using ES module idiom
  const script_url = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
  return import.meta.url === script_url
}

if (is_main_module()) {
  // Enable debug output
  if (process.env.DEBUG) {
    debug.enable(process.env.DEBUG)
  } else {
    debug.enable('schedule:*')
  }

  log('Starting schedule processor as standalone service')
  start_schedule_processor()

  // Handle graceful shutdown
  const shutdown = async () => {
    log('Received shutdown signal')
    await stop_schedule_processor()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

export default start_schedule_processor
