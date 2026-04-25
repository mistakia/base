/**
 * Thread Sync IPC
 *
 * Per-request file IPC for forwarding thread sync requests from the API
 * process to the index sync service. Each request is its own file under
 * `embedded-database-index/thread-sync-queue/` containing one of:
 *   - a JSON object {"thread_id":"...","metadata":{...}} for sync requests
 *     where the writer has the metadata in scope
 *   - a bare {thread_id} for sync requests without metadata (consumer reads
 *     metadata.json from disk)
 *   - DELETE:{thread_id} for removals
 *
 * Why per-request files instead of an append-only queue file:
 *   - Bun's fs.watch on Linux reliably surfaces directory entry creates
 *     ("rename" events with filename), but does NOT surface modify events
 *     for files inside a watched directory after the directory inode's
 *     internal state advances past the file's original inode. An append-
 *     only queue file with atomic-rename processing therefore goes silent
 *     after the first drain cycle.
 *   - Per-file requests give every enqueue a fresh inode, fire a reliable
 *     event, and avoid any read-modify-write race between concurrent API
 *     writers.
 *
 * Crash safety: each request file is an atomic write. If the consumer
 * crashes mid-drain, unprocessed files remain on disk and are picked up on
 * the next start. The consumer reads, processes, and unlinks each file in
 * sequence; idempotent SQLite UPSERTs make a duplicate read harmless.
 *
 * Backward compatibility: a legacy single `.thread-sync-queue` file from
 * prior versions is drained once on startup if present, then unlinked.
 */

import fs from 'fs/promises'
import { watch as fs_watch } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import debug from 'debug'

import config from '#config'

const log = debug('embedded-index:sync:thread-ipc')

const QUEUE_DIR_NAME = 'thread-sync-queue'
const REQUEST_SUFFIX = '.req'
const LEGACY_QUEUE_FILE_NAME = '.thread-sync-queue'
const DELETE_PREFIX = 'DELETE:'
const OPERATION_TIMEOUT_MS = 30000
// Trigger overflow recovery if the directory grows past this many pending
// requests -- indicates the consumer is hopelessly behind.
const MAX_QUEUE_FILES = 10000
// Safety net: if fs.watch ever drops an event, this catches it.
const FALLBACK_POLL_INTERVAL_MS = 60000
// Coalesce rapid bursts of writes into a single process_queue invocation.
const WATCH_DEBOUNCE_MS = 50

let watcher_active = false
let fs_watcher = null
let fallback_interval = null
let debounce_timer = null
let is_processing = false

function get_queue_dir() {
  return path.join(
    config.user_base_directory,
    'embedded-database-index',
    QUEUE_DIR_NAME
  )
}

function get_legacy_queue_file_path() {
  return path.join(
    config.user_base_directory,
    'embedded-database-index',
    LEGACY_QUEUE_FILE_NAME
  )
}

// ============================================================================
// API Side (Writer)
// ============================================================================

/**
 * Write a single request file with the given payload. Each call creates a
 * fresh file with a unique name so the directory watcher fires reliably.
 */
async function write_request_file(payload, description) {
  const queue_dir = get_queue_dir()
  const filename = `${Date.now()}-${process.pid}-${randomUUID()}${REQUEST_SUFFIX}`
  const target = path.join(queue_dir, filename)

  try {
    await fs.writeFile(target, payload, 'utf-8')
    log('Queued %s', description)
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(queue_dir, { recursive: true })
      await fs.writeFile(target, payload, 'utf-8')
      log('Queued %s (created dir)', description)
    } else {
      log('Failed to queue %s: %s', description, error.message)
    }
  }
}

/**
 * Append a thread sync request to the queue.
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
      ? JSON.stringify({ thread_id, metadata })
      : thread_id
  await write_request_file(payload, `thread sync: ${thread_id}`)
}

/**
 * Append a thread delete request to the queue.
 * Called by the API process when a thread metadata file is deleted.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Thread ID to remove
 */
export async function write_thread_delete_request({ thread_id }) {
  await write_request_file(
    `${DELETE_PREFIX}${thread_id}`,
    `thread delete: ${thread_id}`
  )
}

// ============================================================================
// Sync Service Side (Reader)
// ============================================================================

/**
 * Parse a single request payload. Supports:
 *   - JSON object: {"thread_id":"...","metadata":{...}}
 *   - Bare thread_id (legacy / metadata-less callers)
 *   - DELETE:{thread_id}
 *
 * Returns { kind: 'sync', thread_id, metadata } or { kind: 'delete', thread_id }
 * or null on malformed input.
 */
function parse_request_payload(payload) {
  const trimmed = payload.trim()
  if (!trimmed) return null

  if (trimmed.startsWith(DELETE_PREFIX)) {
    return { kind: 'delete', thread_id: trimmed.slice(DELETE_PREFIX.length) }
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed.thread_id === 'string') {
        return {
          kind: 'sync',
          thread_id: parsed.thread_id,
          metadata: parsed.metadata ?? null
        }
      }
      return null
    } catch {
      return null
    }
  }

  return { kind: 'sync', thread_id: trimmed, metadata: null }
}

/**
 * Drain a one-time legacy queue file (from versions of this module that used
 * a single append-only file). Returns the parsed entries in chronological
 * order, then unlinks the file. No-op if the legacy file does not exist.
 */
async function drain_legacy_queue() {
  const legacy_path = get_legacy_queue_file_path()
  let content
  try {
    content = await fs.readFile(legacy_path, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return []
    log('Failed to read legacy queue file: %s', error.message)
    return []
  }

  const entries = []
  for (const line of content.split('\n')) {
    const parsed = parse_request_payload(line)
    if (parsed) entries.push(parsed)
  }

  try {
    await fs.unlink(legacy_path)
    log('Drained and removed legacy queue file (%d entries)', entries.length)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('Failed to unlink legacy queue file: %s', error.message)
    }
  }

  return entries
}

/**
 * List request files in the queue directory in chronological order. Uses the
 * filename's leading timestamp prefix; two files written in the same ms by
 * different processes are ordered by their PID and UUID suffix.
 */
async function list_request_files() {
  const queue_dir = get_queue_dir()
  let names
  try {
    names = await fs.readdir(queue_dir)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    log('Failed to readdir queue: %s', error.message)
    return []
  }
  return names.filter((n) => n.endsWith(REQUEST_SUFFIX)).sort()
}

/**
 * Read and parse all pending request files plus any legacy entries.
 * Deduplicates by thread_id with last-write-wins semantics; the latest entry
 * for a thread_id is the one applied. Delete requests take precedence over
 * any preceding sync for the same thread_id, but a sync after a delete is
 * resurrected (file order is canonical).
 *
 * Returns { syncs, deletes, processed_files, has_overflow }.
 */
async function read_pending_requests(legacy_entries) {
  const queue_dir = get_queue_dir()
  const filenames = await list_request_files()
  const has_overflow = filenames.length > MAX_QUEUE_FILES

  const sync_map = new Map()
  const delete_set = new Set()
  const processed_files = []

  function apply(entry) {
    if (!entry) return
    if (entry.kind === 'delete') {
      delete_set.add(entry.thread_id)
      sync_map.delete(entry.thread_id)
    } else {
      delete_set.delete(entry.thread_id)
      sync_map.set(entry.thread_id, entry.metadata)
    }
  }

  for (const entry of legacy_entries) apply(entry)

  for (const filename of filenames) {
    const file_path = path.join(queue_dir, filename)
    try {
      const content = await fs.readFile(file_path, 'utf-8')
      apply(parse_request_payload(content))
      processed_files.push(file_path)
    } catch (error) {
      if (error.code === 'ENOENT') continue
      log('Failed to read request file %s: %s', filename, error.message)
    }
  }

  const syncs = [...sync_map.entries()].map(([thread_id, metadata]) => ({
    thread_id,
    metadata
  }))
  return {
    syncs,
    deletes: [...delete_set],
    processed_files,
    has_overflow
  }
}

async function unlink_processed_files(file_paths) {
  for (const file_path of file_paths) {
    try {
      await fs.unlink(file_path)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log('Failed to unlink request file %s: %s', file_path, error.message)
      }
    }
  }
}

/**
 * Wrap a promise with a timeout.
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
 * Process all pending request files plus any one-shot legacy queue entries.
 *
 * @param {Object} callbacks
 * @param {Function} callbacks.on_thread_sync - Called with { thread_id, metadata }
 * @param {Function} callbacks.on_thread_delete - Called with { thread_id }
 * @param {Function} [callbacks.on_overflow]
 * @param {Object} [callbacks.metrics]
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
    const legacy_entries = await drain_legacy_queue()

    const { syncs, deletes, processed_files, has_overflow } =
      await read_pending_requests(legacy_entries)

    if (metrics) metrics.gauge('ipc_queue_depth', syncs.length + deletes.length)

    if (syncs.length === 0 && deletes.length === 0 && !has_overflow) {
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
        if (metrics && error.message?.includes('timed out')) {
          metrics.increment('ipc_timeouts')
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
        if (metrics && error.message?.includes('timed out')) {
          metrics.increment('ipc_timeouts')
        }
      }
    }

    if (has_overflow && on_overflow) {
      log('Queue overflow detected, triggering thread directory re-scan')
      if (metrics) metrics.increment('ipc_overflow_events')
      try {
        await on_overflow()
      } catch (error) {
        log('Overflow recovery failed: %s', error.message)
      }
    }

    await unlink_processed_files(processed_files)
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

async function ensure_queue_dir_exists() {
  try {
    await fs.mkdir(get_queue_dir(), { recursive: true })
  } catch (error) {
    log('Failed to ensure queue dir exists: %s', error.message)
  }
}

/**
 * Watch the queue directory. Each enqueue creates a fresh file under the
 * directory, which fires a reliable "rename" (entry-create) event in Bun's
 * fs.watch. The directory inode is stable for the entire process lifetime.
 */
function start_fs_watcher(callbacks) {
  const queue_dir = get_queue_dir()
  try {
    fs_watcher = fs_watch(queue_dir, (_event_type, filename) => {
      if (!filename || filename.endsWith(REQUEST_SUFFIX)) {
        schedule_process(callbacks)
      }
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

// Test-only exports for unit tests of the queue parser. These are internal
// to the IPC implementation and should not be relied upon outside tests.
export const __test__ = {
  parse_request_payload,
  read_pending_requests,
  drain_legacy_queue
}

/**
 * Start watching for thread sync queue entries via fs.watch with a slow
 * fallback interval as a safety net for dropped events.
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

  log('Starting thread sync request watcher for %s', get_queue_dir())

  const callbacks = { on_thread_sync, on_thread_delete, on_overflow, metrics }
  watcher_active = true

  await ensure_queue_dir_exists()

  // Drain any pending entries (including legacy queue file) before we begin
  // watching so a write that arrives before the watcher attaches isn't lost.
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
