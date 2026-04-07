/**
 * Sync Trigger Handler
 *
 * Handles file-based IPC for CLI-triggered syncs when the server is running.
 * The CLI writes a trigger file, server processes it and writes a result file.
 */

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'

const log = debug('embedded-index:sync:trigger')

const TRIGGER_FILE_NAME = '.sync-request'
const RESULT_FILE_NAME = '.sync-result'
const POLL_INTERVAL_MS = 1000

let poll_timer = null
let trigger_directory = null

/**
 * Get the trigger directory path
 * @returns {string} Path to embedded-database-index directory
 */
function get_trigger_directory() {
  const user_base_directory = config.user_base_directory
  return path.join(user_base_directory, 'embedded-database-index')
}

/**
 * Read and parse a trigger file
 * @param {string} file_path - Path to the trigger file
 * @returns {Promise<Object|null>} Parsed trigger request or null on error
 */
async function read_trigger_file(file_path) {
  try {
    const content = await fs.readFile(file_path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    log('Failed to read trigger file %s: %s', file_path, error.message)
    return null
  }
}

/**
 * Delete a file if it exists
 * @param {string} file_path - Path to delete
 */
async function delete_file_if_exists(file_path) {
  try {
    await fs.unlink(file_path)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('Failed to delete file %s: %s', file_path, error.message)
    }
  }
}

/**
 * Write sync result file
 * @param {Object} params
 * @param {string} params.trigger_directory - Directory for result file
 * @param {string} params.request_id - ID from the original request
 * @param {Object} params.result - Sync result
 */
export async function write_sync_result({
  trigger_directory: dir,
  request_id,
  result
}) {
  const result_path = path.join(dir || trigger_directory, RESULT_FILE_NAME)

  const result_data = {
    request_id,
    completed_at: new Date().toISOString(),
    success: result.success,
    method: result.method,
    stats: result.stats || {},
    error: result.error || null
  }

  try {
    await fs.writeFile(result_path, JSON.stringify(result_data, null, 2))
    log('Wrote sync result for request %s', request_id)
  } catch (error) {
    log('Failed to write sync result: %s', error.message)
  }
}

/**
 * Start polling for sync trigger files.
 * Uses filesystem polling instead of chokidar because chokidar under Bun
 * on Linux fails to detect file creation at watched paths reliably.
 * @param {Object} params
 * @param {string} params.trigger_directory - Directory to watch (optional, defaults to embedded-database-index)
 * @param {Function} params.on_sync_request - Callback when sync is requested
 */
export async function start_sync_trigger_watcher({
  trigger_directory: dir,
  on_sync_request
}) {
  if (poll_timer) {
    log('Sync trigger watcher already running')
    return
  }

  trigger_directory = dir || get_trigger_directory()

  const trigger_path = path.join(trigger_directory, TRIGGER_FILE_NAME)

  // Clean up any stale trigger file from a previous run
  await delete_file_if_exists(trigger_path)

  log(
    'Starting sync trigger poller for %s (interval: %dms)',
    trigger_path,
    POLL_INTERVAL_MS
  )

  let is_processing = false

  const poll = async () => {
    if (is_processing) return

    try {
      await fs.access(trigger_path)
    } catch {
      return // File doesn't exist, nothing to do
    }

    is_processing = true
    log('Sync trigger file detected: %s', trigger_path)

    try {
      const request = await read_trigger_file(trigger_path)
      if (!request) {
        log('Invalid trigger file, ignoring')
        await delete_file_if_exists(trigger_path)
        is_processing = false
        return
      }

      log(
        'Processing sync request: %s (type: %s)',
        request.request_id,
        request.type
      )

      if (on_sync_request) {
        try {
          const result = await on_sync_request(request)
          await write_sync_result({
            trigger_directory,
            request_id: request.request_id,
            result
          })
        } catch (error) {
          log('Error processing sync request: %s', error.message)
          await write_sync_result({
            trigger_directory,
            request_id: request.request_id,
            result: {
              success: false,
              error: error.message
            }
          })
        }
      }

      await delete_file_if_exists(trigger_path)
    } catch (error) {
      log('Error in sync trigger poll: %s', error.message)
    } finally {
      is_processing = false
    }
  }

  poll_timer = setInterval(poll, POLL_INTERVAL_MS)

  // Process any existing trigger file immediately
  poll()

  log('Sync trigger poller started')
}

/**
 * Stop the sync trigger watcher
 */
export async function stop_sync_trigger_watcher() {
  if (poll_timer) {
    clearInterval(poll_timer)
    poll_timer = null
    log('Sync trigger poller stopped')
  }
}

/**
 * Write a sync request trigger file (used by CLI)
 * Uses direct write instead of atomic rename because chokidar on Linux
 * under Bun does not detect files created via fs.rename() when watching
 * a non-existent file path (inotify rename events are missed).
 * @param {Object} params
 * @param {string} params.trigger_directory - Directory for trigger file
 * @param {'incremental'|'resync'|'reset'} params.request_type - Type of sync
 * @returns {Promise<string>} Request ID
 */
export async function write_sync_trigger({
  trigger_directory: dir,
  request_type
}) {
  const request_id = crypto.randomUUID()
  const trigger_dir = dir || get_trigger_directory()
  const trigger_path = path.join(trigger_dir, TRIGGER_FILE_NAME)

  const request_data = {
    request_id,
    requested_at: new Date().toISOString(),
    type: request_type,
    requested_by: 'cli'
  }

  await fs.writeFile(trigger_path, JSON.stringify(request_data, null, 2))

  log('Wrote sync trigger: %s (type: %s)', request_id, request_type)
  return request_id
}

/**
 * Poll for sync result
 * @param {Object} params
 * @param {string} params.result_path - Path to result file
 * @param {string} params.request_id - Expected request ID
 * @param {number} params.timeout_ms - Maximum time to wait
 * @param {number} params.poll_interval_ms - Interval between polls
 * @returns {Promise<Object|null>} Result or null on timeout
 */
export async function poll_for_sync_result({
  result_path,
  request_id,
  timeout_ms = 60000,
  poll_interval_ms = 200
}) {
  const start_time = Date.now()

  while (Date.now() - start_time < timeout_ms) {
    try {
      const content = await fs.readFile(result_path, 'utf-8')
      const result = JSON.parse(content)

      if (result.request_id === request_id) {
        // Delete the result file after reading
        await delete_file_if_exists(result_path)
        return result
      }

      // Result file exists but has different request_id - it's stale, clean it up
      log('Cleaning up stale result file (request_id: %s)', result.request_id)
      await delete_file_if_exists(result_path)
    } catch (error) {
      // File doesn't exist yet, keep polling
      if (error.code !== 'ENOENT') {
        log('Error reading result file: %s', error.message)
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, poll_interval_ms))
  }

  log('Timeout waiting for sync result')
  // Clean up any remaining result file on timeout
  await delete_file_if_exists(result_path)
  return null
}

export { TRIGGER_FILE_NAME, RESULT_FILE_NAME }
