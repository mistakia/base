/**
 * Entity Change IPC
 *
 * File-based IPC for notifying base-api of entity changes from the
 * index-sync-service. Mirrors the thread-sync-ipc.mjs pattern:
 *   - Writer (index-sync-service): appends change notifications after sync
 *   - Reader (base-api): polls queue file with atomic rename, routes to consumers
 *
 * Queue line format: {event_type}:{base_uri}\n
 * Event types: create, update, delete
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'

const log = debug('embedded-index:sync:entity-ipc')

const QUEUE_FILE_NAME = '.entity-change-queue'
const PROCESSING_SUFFIX = '.processing'
const MAX_QUEUE_SIZE_BYTES = 1024 * 1024 // 1MB
const POLL_INTERVAL_MS = 2000

let poll_active = false
let poll_timeout = null
let is_processing = false

/**
 * Get the queue file path.
 */
function get_queue_file_path() {
  return path.join(
    config.user_base_directory,
    'embedded-database-index',
    QUEUE_FILE_NAME
  )
}

// ============================================================================
// Writer Side (index-sync-service)
// ============================================================================

/**
 * Write an entity change notification to the queue file.
 *
 * @param {Object} params
 * @param {string} params.event_type - create, update, or delete
 * @param {string} params.base_uri - Entity base URI
 */
export async function write_entity_change_notification({
  event_type,
  base_uri
}) {
  const queue_path = get_queue_file_path()
  const line = `${event_type}:${base_uri}\n`

  try {
    try {
      const stats = await fs.stat(queue_path)
      if (stats.size > MAX_QUEUE_SIZE_BYTES) {
        log('Queue file exceeds size limit (%d bytes), skipping', stats.size)
        return
      }
    } catch {
      // File doesn't exist yet
    }

    await fs.appendFile(queue_path, line, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      try {
        await fs.mkdir(path.dirname(queue_path), { recursive: true })
        await fs.appendFile(queue_path, line, 'utf-8')
      } catch (retry_error) {
        log(
          'Failed to write entity change after mkdir: %s',
          retry_error.message
        )
      }
    } else {
      log('Failed to write entity change: %s', error.message)
    }
  }
}

// ============================================================================
// Reader Side (base-api)
// ============================================================================

/**
 * Atomically acquire the queue file for processing.
 *
 * @returns {Promise<string|null>} Path to processing file, or null
 */
async function acquire_queue_for_processing() {
  const queue_path = get_queue_file_path()
  const processing_path = queue_path + PROCESSING_SUFFIX

  // Check for leftover processing file from a previous crash
  try {
    await fs.access(processing_path)
    log('Found leftover processing file, resuming')
    return processing_path
  } catch {
    // No leftover
  }

  try {
    await fs.rename(queue_path, processing_path)
    return processing_path
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    log('Failed to acquire queue: %s', error.message)
    return null
  }
}

/**
 * Read and parse queue entries. Deduplicates by base_uri, keeping
 * the latest event_type for each URI.
 *
 * @param {string} file_path - Path to processing file
 * @returns {Promise<Array<{ event_type: string, base_uri: string }>>}
 */
async function read_and_parse_queue(file_path) {
  try {
    const content = await fs.readFile(file_path, 'utf-8')
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    // Deduplicate: latest event per base_uri wins
    const uri_map = new Map()
    for (const line of lines) {
      const colon_index = line.indexOf(':')
      if (colon_index === -1) continue
      const event_type = line.slice(0, colon_index)
      const base_uri = line.slice(colon_index + 1)
      if (base_uri) {
        uri_map.set(base_uri, event_type)
      }
    }

    const entries = []
    for (const [base_uri, event_type] of uri_map) {
      entries.push({ event_type, base_uri })
    }
    return entries
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }
    log('Failed to read queue file: %s', error.message)
    return []
  }
}

/**
 * Remove the processing file.
 */
async function remove_processing_file() {
  const processing_path = get_queue_file_path() + PROCESSING_SUFFIX
  try {
    await fs.unlink(processing_path)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('Failed to remove processing file: %s', error.message)
    }
  }
}

/**
 * Process all entries in the queue.
 *
 * @param {Object} params
 * @param {Function} params.on_entity_change - Called once per batch with { entries: Array<{ event_type, base_uri }> }
 */
async function process_queue({ on_entity_change }) {
  if (is_processing) {
    return
  }

  is_processing = true

  try {
    const processing_path = await acquire_queue_for_processing()
    if (!processing_path) {
      return
    }

    const entries = await read_and_parse_queue(processing_path)

    if (entries.length === 0) {
      await remove_processing_file()
      return
    }

    log('Processing entity change queue: %d entries', entries.length)

    // Dispatch a single batch notification rather than per-entry to avoid
    // redundant cache invalidation (e.g., multiple warm_tasks_cache() calls).
    try {
      await on_entity_change({ entries })
    } catch (error) {
      log('Error processing entity change batch: %s', error.message)
    }

    await remove_processing_file()
  } catch (error) {
    log('Entity change queue processing failed: %s', error.message)
  } finally {
    is_processing = false
  }
}

/**
 * Poll loop using recursive setTimeout for sequential execution.
 */
async function poll_loop(callbacks) {
  if (!poll_active) {
    return
  }

  await process_queue(callbacks)

  if (poll_active) {
    poll_timeout = setTimeout(() => poll_loop(callbacks), POLL_INTERVAL_MS)
  }
}

/**
 * Start polling for entity change notifications.
 *
 * @param {Object} params
 * @param {Function} params.on_entity_change - Called once per batch with { entries: Array<{ event_type, base_uri }> }
 */
export function start_entity_change_watcher({ on_entity_change }) {
  if (poll_active) {
    log('Entity change watcher already running')
    return
  }

  log('Starting entity change watcher for %s', get_queue_file_path())

  poll_active = true
  poll_loop({ on_entity_change })
}

/**
 * Stop the entity change watcher.
 */
export function stop_entity_change_watcher() {
  if (!poll_active) {
    return
  }

  log('Stopping entity change watcher')
  poll_active = false

  if (poll_timeout) {
    clearTimeout(poll_timeout)
    poll_timeout = null
  }
}
