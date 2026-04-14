import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import config from '#config'
import {
  emit_thread_created,
  emit_thread_updated,
  emit_thread_timeline_entry_added
} from './threads/event-emitter.mjs'
import { read_timeline_jsonl_from_offset } from '#libs-server/threads/timeline/index.mjs'
import { create_keyed_debouncer } from '#libs-server/utils/debounce-by-key.mjs'
import { create_parcel_subscription } from '#libs-server/file-subscriptions/parcel-watcher-adapter.mjs'
import { index_thread_metadata } from '#libs-server/active-sessions/session-thread-matcher.mjs'
import { resolve_queue_path } from '#libs-server/queue/resolve-queue-path.mjs'

const log = debug('threads:watcher')
const log_lifecycle = debug('base:session-lifecycle')
const log_perf = debug('integrations:claude:perf')

/**
 * Filesystem watcher for thread directory
 * Monitors thread metadata and timeline changes to emit real-time WebSocket events
 */

// ============================================================================
// Constants
// ============================================================================

// Max path depth relative to thread directory: thread/{uuid}/file.json
const THREAD_WATCH_DEPTH = 2

const FILE_NAMES = {
  METADATA: 'metadata.json',
  TIMELINE: 'timeline.jsonl'
}

const METADATA_QUEUE_FILE_PATH = resolve_queue_path(
  config.metadata_queue?.queue_file_path,
  '/tmp/claude-pending-metadata-analysis.queue'
)

// ============================================================================
// State Management
// ============================================================================

// Track last-seen timeline state per thread
// Map<thread_id, { timestamp: string, byte_offset: number, ino: number|null }>
const last_seen_state = new Map()

// Cache of latest non-system timeline entry per thread
// Map<thread_id, Object>
const latest_timeline_entry_cache = new Map()

// Cache of parsed thread metadata per thread
// Populated on metadata add/change, used by timeline change handler to avoid re-reading
// Map<thread_id, Object>
const metadata_cache = new Map()

// Watcher instance
let watcher = null

// External hooks for index sync (set via start_thread_watcher options)
let index_sync_hooks = null

// ============================================================================
// Latest Entry Cache
// ============================================================================

/**
 * Find the latest non-system entry from a list of timeline entries.
 * Iterates in reverse to find the most recent non-system entry.
 *
 * @param {Array} entries - Timeline entries
 * @returns {Object|null} Latest non-system entry or null
 */
const find_latest_non_system_entry = (entries) => {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].type !== 'system') {
      return entries[i]
    }
  }
  return null
}

/**
 * Get the cached latest timeline entry for a thread.
 * Returns null if the thread has not been processed by the watcher yet.
 *
 * @param {string} thread_id - UUID of the thread
 * @returns {Object|null} Cached latest non-system timeline entry or null
 */
export const get_cached_latest_timeline_entry = (thread_id) => {
  return latest_timeline_entry_cache.get(thread_id) || null
}

/**
 * Get the metadata cache Map for building reverse indexes.
 * Returns the live Map reference (read-only use expected).
 *
 * @returns {Map<string, Object>} Map of thread_id -> metadata
 */
export const get_metadata_cache = () => metadata_cache

// ============================================================================
// Index Sync Hook Debouncing
// ============================================================================

const index_sync_debouncer = create_keyed_debouncer(500)

/**
 * Schedule a debounced index sync for a thread.
 * Keys by thread_id so that metadata.json and timeline.jsonl changes
 * for the same thread coalesce into a single sync operation.
 *
 * @param {string} thread_id - UUID of the thread
 */
const schedule_thread_index_sync = (thread_id) => {
  if (!index_sync_hooks?.on_thread_sync) return

  const scheduled_at = Date.now()
  log_perf('schedule_thread_index_sync thread_id=%s', thread_id)

  index_sync_debouncer.call(thread_id, () => {
    const cached_metadata = metadata_cache.get(thread_id)
    if (!cached_metadata) {
      log('No cached metadata for thread %s, skipping index sync', thread_id)
      return
    }
    const debounce_ms = Date.now() - scheduled_at
    log_perf(
      'thread_index_sync thread_id=%s debounce_wait_ms=%d',
      thread_id,
      debounce_ms
    )
    index_sync_hooks.on_thread_sync({ thread_id, metadata: cached_metadata })
  })
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Check if a file path is a thread metadata file
 * Matches: thread/{uuid}/metadata.json
 * Excludes: thread/{uuid}/raw-data/ * /metadata.json
 *
 * @param {string} file_path - File path to check
 * @returns {boolean} True if thread metadata file
 */
const is_thread_metadata_file = (file_path) => {
  return (
    file_path.endsWith(`/${FILE_NAMES.METADATA}`) &&
    !file_path.includes('/raw-data/')
  )
}

/**
 * Check if a file path is a timeline file
 *
 * @param {string} file_path - File path to check
 * @returns {boolean} True if timeline file
 */
const is_timeline_file = (file_path) => {
  return file_path.endsWith(`/${FILE_NAMES.TIMELINE}`)
}

/**
 * Extract thread ID from a thread file path
 *
 * @param {string} file_path - Path to file in thread directory
 * @returns {string} Thread UUID
 */
const extract_thread_id_from_path = (file_path) => {
  return path.basename(path.dirname(file_path))
}

// ============================================================================
// File I/O
// ============================================================================

/**
 * Read and parse thread metadata from file
 *
 * @param {string} file_path - Path to metadata.json
 * @returns {Promise<Object|null>} Parsed metadata or null on error
 */
const read_thread_metadata = async (file_path) => {
  try {
    const content = await fs.readFile(file_path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    log(`Failed to read thread metadata from ${file_path}:`, error)
    return null
  }
}

/**
 * Get thread metadata from cache, falling back to disk read.
 *
 * @param {string} thread_id - UUID of the thread
 * @param {string} metadata_dir - Directory containing metadata.json
 * @returns {Promise<Object|null>} Parsed metadata or null
 */
const get_or_read_metadata = async (thread_id, metadata_dir) => {
  let metadata = metadata_cache.get(thread_id)
  if (!metadata) {
    metadata = await read_thread_metadata(
      path.join(metadata_dir, FILE_NAMES.METADATA)
    )
    if (metadata) {
      metadata_cache.set(thread_id, metadata)
      index_thread_metadata({ thread_id, metadata })
    }
  }
  return metadata
}

// ============================================================================
// Incremental Timeline Tracking
// ============================================================================

/**
 * Initialize tracking state for a thread using streaming extraction and stat.
 * Avoids loading the full timeline into memory.
 *
 * @param {string} thread_id - UUID of the thread
 * @param {string} timeline_path - Path to timeline.jsonl
 * @returns {Promise<Array>} All entries (first-time detection returns full set)
 */
const initialize_thread_tracking = async (thread_id, timeline_path) => {
  const result = await read_timeline_jsonl_from_offset({
    timeline_path,
    byte_offset: 0
  })

  if (!result || result.entries.length === 0) {
    last_seen_state.set(thread_id, {
      timestamp: null,
      byte_offset: 0,
      ino: result?.ino ?? null
    })
    return []
  }

  const last_entry = result.entries[result.entries.length - 1]
  last_seen_state.set(thread_id, {
    timestamp: last_entry.timestamp || null,
    byte_offset: result.new_byte_offset,
    ino: result.ino ?? null
  })

  // Populate latest entry cache
  const latest = find_latest_non_system_entry(result.entries)
  if (latest) {
    latest_timeline_entry_cache.set(thread_id, latest)
  }

  log(
    `Initialized tracking for ${thread_id}: offset=${result.new_byte_offset}, ino=${result.ino}`
  )
  return result.entries
}

/**
 * Detect new timeline entries using byte-offset incremental reads.
 * Only reads bytes appended since last check.
 *
 * @param {Object} params
 * @param {string} params.thread_id - UUID of the thread
 * @param {string} params.timeline_path - Path to timeline.jsonl
 * @returns {Promise<Array>} Array of new timeline entries
 */
const detect_new_timeline_entries = async ({ thread_id, timeline_path }) => {
  const tracked = last_seen_state.get(thread_id)

  // First time seeing this thread via timeline change (not metadata add).
  // Full initialization reads the entire timeline to ensure newly appended
  // entries are emitted. Client-side deduplication handles any redundant events.
  if (!tracked) {
    return initialize_thread_tracking(thread_id, timeline_path)
  }

  const result = await read_timeline_jsonl_from_offset({
    timeline_path,
    byte_offset: tracked.byte_offset,
    expected_ino: tracked.ino
  })

  // Inode mismatch or truncation detected (atomic rewrite) -- reinitialize from scratch
  if (result === null) {
    log(
      `Rewrite detected for thread ${thread_id} (inode or size mismatch), reinitializing tracking`
    )
    last_seen_state.delete(thread_id)
    return initialize_thread_tracking(thread_id, timeline_path)
  }

  // Update state with new offset and inode
  if (result.entries.length > 0) {
    const latest_entry = result.entries[result.entries.length - 1]
    last_seen_state.set(thread_id, {
      timestamp: latest_entry.timestamp || tracked.timestamp,
      byte_offset: result.new_byte_offset,
      ino: result.ino ?? null
    })

    // Update latest entry cache
    const latest = find_latest_non_system_entry(result.entries)
    if (latest) {
      latest_timeline_entry_cache.set(thread_id, latest)
    }

    log_lifecycle(
      'WATCHER timeline_changed thread_id=%s prev_offset=%d new_offset=%d new_entries=%d',
      thread_id,
      tracked.byte_offset,
      result.new_byte_offset,
      result.entries.length
    )
    log(
      `Read ${result.entries.length} new entries from offset ${tracked.byte_offset} for thread ${thread_id}`
    )
  } else {
    // Update offset even if no entries (possible blank lines appended)
    last_seen_state.set(thread_id, {
      ...tracked,
      byte_offset: result.new_byte_offset,
      ino: result.ino ?? null
    })
  }

  return result.entries
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Initialize timeline tracking for a new thread if timeline exists.
 * Reads existing entries to populate the latest entry cache, then sets
 * the byte offset to EOF so existing entries are not re-emitted.
 *
 * @param {string} thread_id - UUID of the thread
 * @param {string} thread_dir - Path to thread directory
 */
const initialize_timeline_tracking_for_new_thread = async (
  thread_id,
  thread_dir
) => {
  const timeline_path = path.join(thread_dir, FILE_NAMES.TIMELINE)

  try {
    // Read all existing entries to populate cache
    const result = await read_timeline_jsonl_from_offset({
      timeline_path,
      byte_offset: 0
    })

    if (!result || result.entries.length === 0) {
      last_seen_state.set(thread_id, {
        timestamp: null,
        byte_offset: 0,
        ino: result?.ino ?? null
      })
      log(`No timeline entries yet for thread ${thread_id}`)
      return
    }

    const last_entry = result.entries[result.entries.length - 1]
    last_seen_state.set(thread_id, {
      timestamp: last_entry.timestamp || null,
      byte_offset: result.new_byte_offset,
      ino: result.ino ?? null
    })

    // Populate latest entry cache so get_cached_latest_timeline_entry returns a value
    const latest = find_latest_non_system_entry(result.entries)
    if (latest) {
      latest_timeline_entry_cache.set(thread_id, latest)
    }

    log_lifecycle(
      'WATCHER thread_initialized thread_id=%s byte_offset=%d cached_latest=%s',
      thread_id,
      result.new_byte_offset,
      !!latest
    )
    log(
      `Initialized new thread tracking for ${thread_id}: offset=${result.new_byte_offset}, cached latest entry`
    )
  } catch {
    log(`No timeline yet for thread ${thread_id}`)
  }
}

/**
 * Handle metadata.json file added (thread created)
 *
 * @param {string} file_path - Path to the metadata.json file
 */
const handle_metadata_added = async (file_path) => {
  log(`Detected new metadata file: ${file_path}`)

  const metadata = await read_thread_metadata(file_path)
  if (!metadata) {
    return
  }

  const { thread_id } = metadata

  // Cache metadata for use by timeline change handler
  metadata_cache.set(thread_id, metadata)
  index_thread_metadata(thread_id, metadata)

  log_lifecycle('WATCHER metadata_added thread_id=%s', thread_id)
  log(`Emitting THREAD_CREATED for thread: ${thread_id}`)
  emit_thread_created(metadata)

  // Initialize timeline tracking for this thread
  const thread_dir = path.dirname(file_path)
  await initialize_timeline_tracking_for_new_thread(thread_id, thread_dir)

  // Queue for AI title generation if no AI-generated title exists
  if (
    !metadata.title_prompt_version &&
    metadata.thread_state !== 'archived'
  ) {
    await fs.appendFile(METADATA_QUEUE_FILE_PATH, thread_id + '\n').catch((err) => {
      log(`Failed to queue thread ${thread_id} for metadata analysis: ${err.message}`)
    })
  }

  // Notify index sync hooks (debounced by thread_id)
  if (metadata.thread_id) {
    schedule_thread_index_sync(metadata.thread_id)
  }
}

/**
 * Handle metadata.json file changed (thread updated)
 *
 * @param {string} file_path - Path to the metadata.json file
 */
const handle_metadata_changed = async (file_path) => {
  log(`Detected metadata change: ${file_path}`)

  const metadata = await read_thread_metadata(file_path)
  if (!metadata) {
    return
  }

  // Update metadata cache and reverse index
  if (metadata.thread_id) {
    metadata_cache.set(metadata.thread_id, metadata)
    index_thread_metadata(metadata.thread_id, metadata)
  }

  emit_thread_updated(metadata)

  // Queue for AI title generation if no AI-generated title exists
  if (
    metadata.thread_id &&
    !metadata.title_prompt_version &&
    metadata.thread_state !== 'archived'
  ) {
    await fs.appendFile(METADATA_QUEUE_FILE_PATH, metadata.thread_id + '\n').catch((err) => {
      log(`Failed to queue thread ${metadata.thread_id} for metadata analysis: ${err.message}`)
    })
  }

  // Notify index sync hooks (debounced by thread_id)
  if (metadata.thread_id) {
    schedule_thread_index_sync(metadata.thread_id)
  }
}

/**
 * Emit timeline entry events for new entries
 *
 * @param {string} thread_id - UUID of the thread
 * @param {Array} new_entries - New timeline entries
 * @param {Object} metadata - Thread metadata
 */
const emit_timeline_entry_events = (thread_id, new_entries, metadata) => {
  log_lifecycle(
    'WATCHER timeline_emit thread_id=%s entry_count=%d',
    thread_id,
    new_entries.length
  )
  log(
    `Emitting ${new_entries.length} new timeline entries for thread ${thread_id}`
  )

  const thread_title = metadata.title || null

  for (const entry of new_entries) {
    emit_thread_timeline_entry_added({
      thread_id,
      entry,
      user_public_key: metadata.user_public_key,
      thread_title
    })
  }
}

/**
 * Handle timeline.json file changed (new timeline entries)
 *
 * @param {string} file_path - Path to the timeline.json file
 */
const handle_timeline_changed = async (file_path) => {
  log(`Detected timeline change: ${file_path}`)

  const thread_id = extract_thread_id_from_path(file_path)

  // Detect new entries
  const new_entries = await detect_new_timeline_entries({
    thread_id,
    timeline_path: file_path
  })

  if (new_entries.length === 0) {
    log(`No new timeline entries for thread ${thread_id}`)
    return
  }

  const metadata = await get_or_read_metadata(
    thread_id,
    path.dirname(file_path)
  )

  if (!metadata) {
    log(`Could not read metadata for thread ${thread_id}`)
    return
  }

  emit_timeline_entry_events(thread_id, new_entries, metadata)

  // Notify index sync hooks (debounced by thread_id)
  schedule_thread_index_sync(thread_id)
}

// ============================================================================
// FSEvents Error Recovery
// ============================================================================

const RECONCILIATION_DEBOUNCE_MS = 5000

let reconciliation_timer = null

/**
 * Reconcile tracked threads after FSEvents drops events.
 * Iterates last_seen_state, stats each timeline file, and processes any
 * with changed inode or size via detect_new_timeline_entries.
 *
 * @param {string} thread_directory - Absolute path to thread directory
 */
const reconcile_tracked_threads = async (thread_directory) => {
  log(
    'Starting reconciliation scan of %d tracked threads',
    last_seen_state.size
  )
  let changes_found = 0

  for (const [thread_id, tracked] of last_seen_state.entries()) {
    const timeline_path = path.join(
      thread_directory,
      thread_id,
      FILE_NAMES.TIMELINE
    )

    let stat
    try {
      stat = await fs.stat(timeline_path)
    } catch {
      // File gone or inaccessible -- skip
      continue
    }

    // Check for inode or size change
    const ino_changed = tracked.ino !== null && stat.ino !== tracked.ino
    const size_changed = stat.size !== tracked.byte_offset

    if (!ino_changed && !size_changed) {
      continue
    }

    log(
      'Reconciliation: thread %s changed (ino: %s, size: %s)',
      thread_id,
      ino_changed ? `${tracked.ino}->${stat.ino}` : 'same',
      size_changed ? `${tracked.byte_offset}->${stat.size}` : 'same'
    )

    try {
      const new_entries = await detect_new_timeline_entries({
        thread_id,
        timeline_path
      })

      if (new_entries.length > 0) {
        changes_found++

        const metadata = await get_or_read_metadata(
          thread_id,
          path.join(thread_directory, thread_id)
        )

        if (metadata) {
          emit_timeline_entry_events(thread_id, new_entries, metadata)
          schedule_thread_index_sync(thread_id)
        }
      }
    } catch (error) {
      log('Reconciliation error for thread %s: %O', thread_id, error)
    }
  }

  if (changes_found > 0) {
    log('Reconciliation scan found missed changes in %d threads', changes_found)
  } else {
    log('Reconciliation scan complete, no missed changes')
  }
}

/**
 * Schedule a debounced reconciliation scan.
 * Coalesces multiple rapid FSEvents errors into a single scan.
 *
 * @param {string} thread_directory - Absolute path to thread directory
 */
const schedule_reconciliation = (thread_directory) => {
  if (reconciliation_timer) {
    clearTimeout(reconciliation_timer)
  }
  reconciliation_timer = setTimeout(() => {
    reconciliation_timer = null
    reconcile_tracked_threads(thread_directory).catch((error) => {
      log('Reconciliation scan failed: %O', error)
    })
  }, RECONCILIATION_DEBOUNCE_MS)
}

// ============================================================================
// Watcher Setup & Management
// ============================================================================

/**
 * Check if a path is within the allowed depth for thread events.
 * Only processes files at thread/{uuid}/file.json (depth 2 relative to thread dir).
 *
 * @param {string} file_path - Absolute file path
 * @param {string} thread_directory - Absolute path to thread directory
 * @returns {boolean} True if within allowed depth
 */
const is_within_thread_depth = (file_path, thread_directory) => {
  const relative = path.relative(thread_directory, file_path)
  const segments = relative.split(path.sep)
  return segments.length <= THREAD_WATCH_DEPTH
}

/**
 * Handle a batch of @parcel/watcher events for the thread directory.
 * Filters by depth and routes to appropriate handlers.
 *
 * @param {Array<{type: string, path: string}>} events - Batch of file events
 * @param {string} thread_directory - Absolute path to thread directory
 */
const handle_thread_events = async (events, thread_directory) => {
  for (const event of events) {
    const file_path = event.path

    // Filter by depth: only process thread/{uuid}/file.json
    if (!is_within_thread_depth(file_path, thread_directory)) {
      continue
    }

    try {
      switch (event.type) {
        case 'create':
          if (is_thread_metadata_file(file_path)) {
            await handle_metadata_added(file_path)
          } else if (is_timeline_file(file_path)) {
            // Handle timeline creation from atomic rename (write_timeline_jsonl
            // writes to a temp file then fs.rename to target, which @parcel/watcher
            // may report as 'create' rather than 'update')
            await handle_timeline_changed(file_path)
          }
          break
        case 'update':
          if (is_thread_metadata_file(file_path)) {
            await handle_metadata_changed(file_path)
          } else if (is_timeline_file(file_path)) {
            await handle_timeline_changed(file_path)
          }
          break
        case 'delete':
          if (is_thread_metadata_file(file_path)) {
            log(`Detected metadata deleted: ${file_path}`)
            if (index_sync_hooks?.on_thread_delete) {
              index_sync_hooks.on_thread_delete(file_path)
            }
          }
          break
      }
    } catch (error) {
      log(`Error handling ${event.type} event for ${file_path}:`, error)
    }
  }
}

/**
 * Start filesystem watcher for thread directory using @parcel/watcher.
 * Uses directory-only watches (no per-file inotify overhead on Linux).
 *
 * @param {Object} params
 * @param {string} params.thread_directory - Absolute path to thread directory
 * @param {Object} [params.hooks] - Optional hooks for external consumers (e.g. index sync)
 * @param {Function} [params.hooks.on_thread_sync] - Called with { thread_id, metadata } on any thread file change (debounced by thread_id, coalesces metadata + timeline changes)
 * @param {Function} [params.hooks.on_thread_delete] - Called with metadata file path on unlink
 * @returns {Promise<Object>} Subscription handle
 */
export const start_thread_watcher = async ({ thread_directory, hooks }) => {
  if (watcher) {
    log('Thread watcher already running')
    return watcher
  }

  // Store hooks for use by event handlers
  index_sync_hooks = hooks || null

  log(`Starting thread watcher for directory: ${thread_directory}`)

  try {
    watcher = await create_parcel_subscription({
      directory: thread_directory,
      ignore: ['**/raw-data'],
      on_events: (events) => handle_thread_events(events, thread_directory),
      on_error: () => {
        log('FSEvents error received, scheduling reconciliation scan')
        schedule_reconciliation(thread_directory)
      }
    })

    log('Thread watcher ready and monitoring for changes')
    return watcher
  } catch (error) {
    log('Failed to start thread watcher:', error)
    throw error
  }
}

/**
 * Set index sync hooks after watcher has started.
 * Used when the embedded index initializes after the thread watcher.
 *
 * @param {Object} hooks - Hook callbacks (same shape as start_thread_watcher hooks param)
 */
export const set_thread_watcher_hooks = (hooks) => {
  index_sync_hooks = hooks || null
  log('Index sync hooks %s', hooks ? 'set' : 'cleared')
}

/**
 * Stop filesystem watcher
 *
 * @returns {Promise<void>}
 */
export const stop_thread_watcher = async () => {
  if (!watcher) {
    log('No thread watcher to stop')
    return
  }

  log('Stopping thread watcher')

  try {
    await watcher.unsubscribe()
    watcher = null
    last_seen_state.clear()
    latest_timeline_entry_cache.clear()
    metadata_cache.clear()
    index_sync_hooks = null

    // Clear reconciliation timer
    if (reconciliation_timer) {
      clearTimeout(reconciliation_timer)
      reconciliation_timer = null
    }

    // Clear index sync debounce timers
    index_sync_debouncer.clear_all()

    log('Thread watcher stopped')
  } catch (error) {
    log('Error stopping thread watcher:', error)
    throw error
  }
}
