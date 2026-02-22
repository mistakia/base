/**
 * Thread Sync IPC
 *
 * File-based IPC for forwarding thread sync requests from the API process
 * to the index sync service. Uses a queue file where each line is a
 * thread_id (for syncs) or DELETE:{thread_id} (for removals).
 *
 * API process appends to the queue file when the thread watcher detects changes.
 * Sync service watches the queue file and processes entries.
 *
 * Queue processing uses atomic rename to prevent data loss:
 * 1. Rename queue file to .processing (atomic on POSIX)
 * 2. Read and process entries from .processing file
 * 3. Delete .processing file when done
 * New writes from the API create a fresh queue file during processing.
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
// Chokidar retained: watches 2 IPC files. Not worth migrating to @parcel/watcher.
import chokidar from 'chokidar'

import config from '#config'

const log = debug('embedded-index:sync:thread-ipc')

const QUEUE_FILE_NAME = '.thread-sync-queue'
const DELETE_PREFIX = 'DELETE:'
const PROCESSING_SUFFIX = '.processing'
const MAX_QUEUE_SIZE_BYTES = 1024 * 1024 // 1MB
const PROCESS_DELAY_MS = 1000
const OPERATION_TIMEOUT_MS = 30000

let queue_watcher = null
let process_timeout = null
let is_processing = false

/**
 * Get the queue file path
 * @returns {string} Path to the thread sync queue file
 */
function get_queue_file_path() {
  const user_base_directory = config.user_base_directory
  return path.join(
    user_base_directory,
    'embedded-database-index',
    QUEUE_FILE_NAME
  )
}

// ============================================================================
// API Side (Writer)
// ============================================================================

/**
 * Append a line to the queue file with directory auto-creation and size limits.
 *
 * @param {string} content - Line content to append (including newline)
 * @param {string} description - Human-readable description for logging
 */
async function append_to_queue(content, description) {
  const queue_path = get_queue_file_path()

  try {
    try {
      const stats = await fs.stat(queue_path)
      if (stats.size > MAX_QUEUE_SIZE_BYTES) {
        log(
          'Queue file exceeds size limit (%d bytes), skipping: %s',
          stats.size,
          description
        )
        return
      }
    } catch {
      // File doesn't exist yet, proceed with append
    }

    await fs.appendFile(queue_path, content, 'utf-8')
    log('Queued %s', description)
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(path.dirname(queue_path), { recursive: true })
      await fs.appendFile(queue_path, content, 'utf-8')
      log('Queued %s (created dir)', description)
    } else {
      log('Failed to queue %s: %s', description, error.message)
    }
  }
}

/**
 * Append a thread sync request to the queue file.
 * Called by the API process when the thread watcher detects changes.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Thread ID to sync
 */
export async function write_thread_sync_request({ thread_id }) {
  await append_to_queue(`${thread_id}\n`, `thread sync: ${thread_id}`)
}

/**
 * Append a thread delete request to the queue file.
 * Called by the API process when a thread metadata file is deleted.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Thread ID to remove
 */
export async function write_thread_delete_request({ thread_id }) {
  await append_to_queue(
    `${DELETE_PREFIX}${thread_id}\n`,
    `thread delete: ${thread_id}`
  )
}

// ============================================================================
// Sync Service Side (Reader)
// ============================================================================

/**
 * Atomically acquire the queue file for processing by renaming it.
 * New writes from the API process will create a fresh queue file.
 * Handles crash recovery by detecting leftover processing files.
 *
 * @returns {Promise<string|null>} Path to processing file, or null if nothing to process
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
    // No leftover processing file
  }

  try {
    await fs.rename(queue_path, processing_path)
    return processing_path
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    log('Failed to acquire queue for processing: %s', error.message)
    return null
  }
}

/**
 * Read and parse entries from a queue file.
 * Deduplicates entries - for syncs, keeps unique thread_ids.
 * Delete requests take precedence over sync requests for the same thread_id.
 *
 * @param {string} file_path - Path to the file to read
 * @returns {Promise<{ syncs: string[], deletes: string[] }>}
 */
async function read_and_parse_queue(file_path) {
  try {
    const content = await fs.readFile(file_path, 'utf-8')
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const delete_set = new Set()
    const sync_set = new Set()

    for (const line of lines) {
      if (line.startsWith(DELETE_PREFIX)) {
        const thread_id = line.slice(DELETE_PREFIX.length)
        delete_set.add(thread_id)
        sync_set.delete(thread_id)
      } else {
        if (!delete_set.has(line)) {
          sync_set.add(line)
        }
      }
    }

    return {
      syncs: [...sync_set],
      deletes: [...delete_set]
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { syncs: [], deletes: [] }
    }
    log('Failed to read queue file: %s', error.message)
    return { syncs: [], deletes: [] }
  }
}

/**
 * Remove the processing file after entries have been processed.
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
 * Wrap a promise with a timeout.
 *
 * @param {Promise} promise - Promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise}
 */
function with_timeout(promise, ms) {
  let timeout_id
  const timeout_promise = new Promise((_resolve, reject) => {
    timeout_id = setTimeout(
      () => reject(new Error(`Operation timed out after ${ms}ms`)),
      ms
    )
  })
  return Promise.race([promise, timeout_promise]).finally(() =>
    clearTimeout(timeout_id)
  )
}

/**
 * Process all entries in the queue using atomic rename.
 *
 * @param {Object} callbacks
 * @param {Function} callbacks.on_thread_sync - Called with { thread_id }
 * @param {Function} callbacks.on_thread_delete - Called with { thread_id }
 */
async function process_queue({ on_thread_sync, on_thread_delete }) {
  if (is_processing) {
    log('Already processing thread sync queue, skipping')
    return
  }

  is_processing = true

  try {
    const processing_path = await acquire_queue_for_processing()
    if (!processing_path) {
      return
    }

    const { syncs, deletes } = await read_and_parse_queue(processing_path)

    if (syncs.length === 0 && deletes.length === 0) {
      await remove_processing_file()
      return
    }

    log(
      'Processing thread sync queue: %d syncs, %d deletes',
      syncs.length,
      deletes.length
    )

    for (const thread_id of deletes) {
      try {
        await with_timeout(
          on_thread_delete({ thread_id }),
          OPERATION_TIMEOUT_MS
        )
      } catch (error) {
        log('Error processing thread delete %s: %s', thread_id, error.message)
      }
    }

    for (const thread_id of syncs) {
      try {
        await with_timeout(on_thread_sync({ thread_id }), OPERATION_TIMEOUT_MS)
      } catch (error) {
        log('Error processing thread sync %s: %s', thread_id, error.message)
      }
    }

    await remove_processing_file()
    log('Thread sync queue processing complete')
  } catch (error) {
    log('Thread sync queue processing failed: %s', error.message)
  } finally {
    is_processing = false
  }
}

/**
 * Schedule queue processing with debounce.
 *
 * @param {Object} callbacks - on_thread_sync and on_thread_delete
 */
function schedule_processing(callbacks) {
  if (process_timeout) {
    clearTimeout(process_timeout)
  }

  process_timeout = setTimeout(() => {
    process_queue(callbacks)
  }, PROCESS_DELAY_MS)
}

/**
 * Start watching the thread sync queue file.
 * Called by the sync service to receive forwarded thread sync requests.
 *
 * @param {Object} params
 * @param {Function} params.on_thread_sync - Called with { thread_id } for each sync request
 * @param {Function} params.on_thread_delete - Called with { thread_id } for each delete request
 */
export function start_thread_sync_request_watcher({
  on_thread_sync,
  on_thread_delete
}) {
  if (queue_watcher) {
    log('Thread sync request watcher already running')
    return
  }

  const queue_path = get_queue_file_path()
  log('Starting thread sync request watcher for %s', queue_path)

  const callbacks = { on_thread_sync, on_thread_delete }

  queue_watcher = chokidar.watch(queue_path, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  })

  queue_watcher.on('add', () => schedule_processing(callbacks))
  queue_watcher.on('change', () => schedule_processing(callbacks))
  queue_watcher.on('error', (error) => {
    log('Thread sync queue watcher error: %s', error.message)
  })
  queue_watcher.on('ready', () => {
    log('Thread sync request watcher ready')
    // Process any existing queue entries on startup
    schedule_processing(callbacks)
  })
}

/**
 * Stop the thread sync request watcher.
 */
export async function stop_thread_sync_request_watcher() {
  if (!queue_watcher) {
    return
  }

  log('Stopping thread sync request watcher')

  if (process_timeout) {
    clearTimeout(process_timeout)
    process_timeout = null
  }

  try {
    await queue_watcher.close()
    queue_watcher = null
    log('Thread sync request watcher stopped')
  } catch (error) {
    log('Error stopping thread sync request watcher: %s', error.message)
  }
}
