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

import config from '#config'

const log = debug('embedded-index:sync:thread-ipc')

const QUEUE_FILE_NAME = '.thread-sync-queue'
const DELETE_PREFIX = 'DELETE:'
const OVERFLOW_PREFIX = 'OVERFLOW:'
const PROCESSING_SUFFIX = '.processing'
const MAX_QUEUE_SIZE_BYTES = 1024 * 1024 // 1MB
const OPERATION_TIMEOUT_MS = 30000
const POLL_INTERVAL_MS = 5000

let poll_active = false
let poll_timeout = null
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
          'Queue file exceeds size limit (%d bytes), writing overflow marker: %s',
          stats.size,
          description
        )
        // Write overflow marker only once -- avoid growing the file further
        // with repeated markers on every subsequent write attempt.
        try {
          const content = await fs.readFile(queue_path, 'utf-8')
          const last_line = content.trimEnd().split('\n').pop() || ''
          if (!last_line.startsWith(OVERFLOW_PREFIX)) {
            await fs.appendFile(
              queue_path,
              `${OVERFLOW_PREFIX}${Date.now()}\n`,
              'utf-8'
            )
          }
        } catch {
          // Best-effort overflow marker
        }
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
 * @returns {Promise<{ syncs: string[], deletes: string[], has_overflow: boolean }>}
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
    let has_overflow = false

    for (const line of lines) {
      if (line.startsWith(OVERFLOW_PREFIX)) {
        has_overflow = true
      } else if (line.startsWith(DELETE_PREFIX)) {
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
      deletes: [...delete_set],
      has_overflow
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { syncs: [], deletes: [], has_overflow: false }
    }
    log('Failed to read queue file: %s', error.message)
    return { syncs: [], deletes: [], has_overflow: false }
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
async function process_queue({
  on_thread_sync,
  on_thread_delete,
  on_overflow,
  metrics
}) {
  // Defense-in-depth: structurally impossible with sequential poll_loop,
  // but guards against future callers invoking process_queue concurrently.
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

    const { syncs, deletes, has_overflow } =
      await read_and_parse_queue(processing_path)

    if (metrics) metrics.gauge('ipc_queue_depth', syncs.length + deletes.length)

    if (syncs.length === 0 && deletes.length === 0 && !has_overflow) {
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
        if (metrics) metrics.increment('ipc_deletes_processed')
      } catch (error) {
        log('Error processing thread delete %s: %s', thread_id, error.message)
        if (metrics) {
          if (error.message?.includes('timed out')) {
            metrics.increment('ipc_timeouts')
          }
        }
      }
    }

    for (const thread_id of syncs) {
      try {
        await with_timeout(on_thread_sync({ thread_id }), OPERATION_TIMEOUT_MS)
        if (metrics) metrics.increment('ipc_syncs_processed')
      } catch (error) {
        log('Error processing thread sync %s: %s', thread_id, error.message)
        if (metrics) {
          if (error.message?.includes('timed out')) {
            metrics.increment('ipc_timeouts')
          }
        }
      }
    }

    // Handle overflow: trigger thread directory re-scan to recover missed syncs
    if (has_overflow && on_overflow) {
      log('Queue overflow detected, triggering thread directory re-scan')
      if (metrics) metrics.increment('ipc_overflow_events')
      try {
        await on_overflow()
      } catch (error) {
        log('Overflow recovery failed: %s', error.message)
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
 * Poll loop using recursive setTimeout to ensure sequential execution.
 * Each iteration waits for processing to complete before scheduling the next.
 *
 * @param {Object} callbacks - on_thread_sync and on_thread_delete
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
 * Start polling for thread sync queue entries.
 * Uses a simple polling loop instead of filesystem event watchers to avoid
 * FSEvents reliability issues (dropped events under high filesystem load).
 *
 * @param {Object} params
 * @param {Function} params.on_thread_sync - Called with { thread_id } for each sync request
 * @param {Function} params.on_thread_delete - Called with { thread_id } for each delete request
 */
export function start_thread_sync_request_watcher({
  on_thread_sync,
  on_thread_delete,
  on_overflow,
  metrics
}) {
  if (poll_active) {
    log('Thread sync request watcher already running')
    return
  }

  log('Starting thread sync request watcher for %s', get_queue_file_path())

  const callbacks = { on_thread_sync, on_thread_delete, on_overflow, metrics }
  poll_active = true

  // Process any existing queue entries on startup, then begin polling
  poll_loop(callbacks)
}

/**
 * Stop the thread sync request watcher.
 */
export function stop_thread_sync_request_watcher() {
  if (!poll_active) {
    return
  }

  log('Stopping thread sync request watcher')
  poll_active = false

  if (poll_timeout) {
    clearTimeout(poll_timeout)
    poll_timeout = null
  }

  log('Thread sync request watcher stopped')
}
