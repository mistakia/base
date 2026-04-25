/**
 * Thread Sync IPC
 *
 * File-based IPC for forwarding thread sync requests from the API process
 * to the index sync service. Uses a queue file where each line is either:
 *   - a JSON object {"thread_id":"...","metadata":{...}} for sync requests
 *     where the writer has the metadata in scope
 *   - a bare {thread_id} for sync requests without metadata (consumer reads
 *     metadata.json from disk)
 *   - DELETE:{thread_id} for removals
 *   - OVERFLOW:{timestamp} when the queue exceeded its size cap
 *
 * The API process appends to the queue file when state changes occur. The
 * sync service watches the queue file via fs.watch and processes entries.
 *
 * Queue processing uses atomic rename to prevent data loss:
 * 1. Rename queue file to .processing (atomic on POSIX)
 * 2. Read and process entries from .processing file
 * 3. Delete .processing file when done
 * New writes from the API create a fresh queue file during processing.
 */

import fs from 'fs/promises'
import { watch as fs_watch } from 'fs'
import path from 'path'
import debug from 'debug'

import config from '#config'

const log = debug('embedded-index:sync:thread-ipc')

const QUEUE_FILE_NAME = '.thread-sync-queue'
const DELETE_PREFIX = 'DELETE:'
const OVERFLOW_PREFIX = 'OVERFLOW:'
const PROCESSING_SUFFIX = '.processing'
// Larger cap to accommodate JSON-line payloads (~500B each) while preserving
// roughly the same headroom in entries as the prior 1MB cap held for bare IDs.
const MAX_QUEUE_SIZE_BYTES = 8 * 1024 * 1024
const OPERATION_TIMEOUT_MS = 30000
// Safety net: if fs.watch ever drops an event, this catches it.
const FALLBACK_POLL_INTERVAL_MS = 60000
// Coalesce rapid bursts of writes into a single process_queue invocation.
const WATCH_DEBOUNCE_MS = 50

let watcher_active = false
let fs_watcher = null
let fallback_interval = null
let debounce_timer = null
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
 * @param {string} payload - Line content to append (including newline)
 * @param {string} description - Human-readable description for logging
 */
async function append_to_queue(payload, description) {
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
          const existing = await fs.readFile(queue_path, 'utf-8')
          const last_line = existing.trimEnd().split('\n').pop() || ''
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

    await fs.appendFile(queue_path, payload, 'utf-8')
    log('Queued %s', description)
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(path.dirname(queue_path), { recursive: true })
      await fs.appendFile(queue_path, payload, 'utf-8')
      log('Queued %s (created dir)', description)
    } else {
      log('Failed to queue %s: %s', description, error.message)
    }
  }
}

/**
 * Append a thread sync request to the queue file.
 * Called by the API process when the thread watcher detects changes or when
 * a thread state/metadata write completes.
 *
 * When `metadata` is provided the consumer skips the disk re-read; otherwise
 * the consumer falls back to reading metadata.json itself.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Thread ID to sync
 * @param {Object} [params.metadata] - Optional thread metadata snapshot
 */
export async function write_thread_sync_request({ thread_id, metadata }) {
  const payload =
    metadata != null
      ? `${JSON.stringify({ thread_id, metadata })}\n`
      : `${thread_id}\n`
  await append_to_queue(payload, `thread sync: ${thread_id}`)
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
 * Parse a single sync line. Supports both formats:
 *   - JSON object: {"thread_id":"...","metadata":{...}}
 *   - Bare thread_id (legacy / metadata-less callers)
 *
 * Returns { thread_id, metadata } where metadata may be null.
 * Returns null on malformed JSON.
 */
function parse_sync_line(line) {
  if (line.startsWith('{')) {
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed.thread_id === 'string') {
        return {
          thread_id: parsed.thread_id,
          metadata: parsed.metadata ?? null
        }
      }
      return null
    } catch {
      return null
    }
  }
  return { thread_id: line, metadata: null }
}

/**
 * Read and parse entries from a queue file.
 * Deduplicates by thread_id with last-write-wins semantics; the latest entry
 * for a thread_id is the one applied. Delete requests take precedence over
 * any preceding sync for the same thread_id, but a sync after a delete is
 * resurrected (rare, but the file order is canonical).
 *
 * @param {string} file_path - Path to the file to read
 * @returns {Promise<{ syncs: Array<{thread_id: string, metadata: Object|null}>, deletes: string[], has_overflow: boolean }>}
 */
async function read_and_parse_queue(file_path) {
  try {
    const content = await fs.readFile(file_path, 'utf-8')
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const delete_set = new Set()
    const sync_map = new Map()
    let has_overflow = false

    for (const line of lines) {
      if (line.startsWith(OVERFLOW_PREFIX)) {
        has_overflow = true
      } else if (line.startsWith(DELETE_PREFIX)) {
        const thread_id = line.slice(DELETE_PREFIX.length)
        delete_set.add(thread_id)
        sync_map.delete(thread_id)
      } else {
        const parsed = parse_sync_line(line)
        if (!parsed) {
          log('Skipping malformed queue line: %s', line.slice(0, 80))
          continue
        }
        // A sync after a delete in the same batch resurrects the thread; the
        // file order is canonical so we honor it.
        delete_set.delete(parsed.thread_id)
        sync_map.set(parsed.thread_id, parsed.metadata)
      }
    }

    const syncs = [...sync_map.entries()].map(([thread_id, metadata]) => ({
      thread_id,
      metadata
    }))

    return {
      syncs,
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
 * @param {Function} callbacks.on_thread_sync - Called with { thread_id, metadata }
 * @param {Function} callbacks.on_thread_delete - Called with { thread_id }
 */
async function process_queue({
  on_thread_sync,
  on_thread_delete,
  on_overflow,
  metrics
}) {
  // Reentrancy guard: fs.watch may fire a second event while we are mid-batch.
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

    for (const { thread_id, metadata } of syncs) {
      try {
        await with_timeout(
          on_thread_sync({ thread_id, metadata }),
          OPERATION_TIMEOUT_MS
        )
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
 * Schedule a debounced process_queue. Coalesces bursts of fs.watch events.
 */
function schedule_process(callbacks) {
  if (debounce_timer) clearTimeout(debounce_timer)
  debounce_timer = setTimeout(() => {
    debounce_timer = null
    process_queue(callbacks).catch((error) => {
      log('process_queue threw: %s', error.message)
    })
  }, WATCH_DEBOUNCE_MS)
}

/**
 * Ensure the parent directory exists so fs.watch can attach to it.
 */
async function ensure_queue_dir_exists() {
  const queue_path = get_queue_file_path()
  try {
    await fs.mkdir(path.dirname(queue_path), { recursive: true })
  } catch (error) {
    log('Failed to ensure queue dir exists: %s', error.message)
  }
}

/**
 * Attach fs.watch to the queue file's parent directory and filter by
 * filename. The queue uses atomic rename for processing, so the queue file's
 * inode changes on every drain cycle -- a file-level watcher would lose its
 * inotify reference. Watching the directory is stable across rename/recreate.
 */
function start_fs_watcher(callbacks) {
  const queue_path = get_queue_file_path()
  const parent_dir = path.dirname(queue_path)
  try {
    fs_watcher = fs_watch(parent_dir, (_event_type, filename) => {
      if (filename === QUEUE_FILE_NAME) schedule_process(callbacks)
    })
    fs_watcher.on('error', (error) => {
      log('fs.watch error on queue directory: %s', error.message)
    })
    log('fs.watch attached to queue directory')
  } catch (error) {
    log(
      'Failed to attach fs.watch (relying on fallback poll): %s',
      error.message
    )
  }
}

/**
 * Start watching for thread sync queue entries via fs.watch with a slow
 * fallback interval as a safety net for dropped events.
 *
 * @param {Object} params
 * @param {Function} params.on_thread_sync - Called with { thread_id, metadata } for each sync request
 * @param {Function} params.on_thread_delete - Called with { thread_id } for each delete request
 * @param {Function} [params.on_overflow] - Called when queue overflow is detected
 * @param {Object} [params.metrics] - Metrics collector
 */
export async function start_thread_sync_request_watcher({
  on_thread_sync,
  on_thread_delete,
  on_overflow,
  metrics
}) {
  if (watcher_active) {
    log('Thread sync request watcher already running')
    return
  }

  log('Starting thread sync request watcher for %s', get_queue_file_path())

  const callbacks = { on_thread_sync, on_thread_delete, on_overflow, metrics }
  watcher_active = true

  await ensure_queue_dir_exists()

  // Drain any entries left from a prior process before we begin watching.
  process_queue(callbacks).catch((error) => {
    log('Initial drain failed: %s', error.message)
  })

  start_fs_watcher(callbacks)

  fallback_interval = setInterval(
    () => process_queue(callbacks),
    FALLBACK_POLL_INTERVAL_MS
  )
  if (fallback_interval.unref) fallback_interval.unref()
}

// Test-only exports for unit tests of the queue parser. These are internal
// to the IPC implementation and should not be relied upon outside tests.
export const __test__ = { parse_sync_line, read_and_parse_queue }

/**
 * Stop the thread sync request watcher.
 */
export function stop_thread_sync_request_watcher() {
  if (!watcher_active) {
    return
  }

  log('Stopping thread sync request watcher')
  watcher_active = false

  if (fs_watcher) {
    try {
      fs_watcher.close()
    } catch (error) {
      log('Error closing fs.watcher: %s', error.message)
    }
    fs_watcher = null
  }

  if (fallback_interval) {
    clearInterval(fallback_interval)
    fallback_interval = null
  }

  if (debounce_timer) {
    clearTimeout(debounce_timer)
    debounce_timer = null
  }

  log('Thread sync request watcher stopped')
}
