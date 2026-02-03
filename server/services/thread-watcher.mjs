import chokidar from 'chokidar'
import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import {
  emit_thread_created,
  emit_thread_updated,
  emit_thread_timeline_entry_added
} from '#libs-server/threads/event-emitter.mjs'
import { read_timeline_jsonl_from_offset } from '#libs-server/threads/timeline/index.mjs'

const log = debug('threads:watcher')

/**
 * Filesystem watcher for thread directory
 * Monitors thread metadata and timeline changes to emit real-time WebSocket events
 */

// ============================================================================
// Constants
// ============================================================================

const WATCHER_CONFIG = {
  STABILITY_THRESHOLD_MS: 500, // Wait after last file change before processing
  POLL_INTERVAL_MS: 100, // File polling frequency
  DEPTH: 2 // Watch thread/{uuid}/file.json
}

const FILE_NAMES = {
  METADATA: 'metadata.json',
  TIMELINE: 'timeline.jsonl'
}

// ============================================================================
// State Management
// ============================================================================

// Track last-seen timeline state per thread
// Map<thread_id, { timestamp: string, byte_offset: number }>
const last_seen_state = new Map()

// Watcher instance
let watcher = null

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
    last_seen_state.set(thread_id, { timestamp: null, byte_offset: 0 })
    return []
  }

  const last_entry = result.entries[result.entries.length - 1]
  last_seen_state.set(thread_id, {
    timestamp: last_entry.timestamp || null,
    byte_offset: result.new_byte_offset
  })

  log(`Initialized tracking for ${thread_id}: offset=${result.new_byte_offset}`)
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

  // First time seeing this thread
  if (!tracked) {
    return initialize_thread_tracking(thread_id, timeline_path)
  }

  const result = await read_timeline_jsonl_from_offset({
    timeline_path,
    byte_offset: tracked.byte_offset
  })

  // Truncation detected (atomic rewrite) -- reinitialize from scratch
  if (result === null) {
    log(
      `Truncation detected for thread ${thread_id}, reinitializing tracking`
    )
    last_seen_state.delete(thread_id)
    return initialize_thread_tracking(thread_id, timeline_path)
  }

  // Update state with new offset
  if (result.entries.length > 0) {
    const latest_entry = result.entries[result.entries.length - 1]
    last_seen_state.set(thread_id, {
      timestamp: latest_entry.timestamp || tracked.timestamp,
      byte_offset: result.new_byte_offset
    })
    log(
      `Read ${result.entries.length} new entries from offset ${tracked.byte_offset} for thread ${thread_id}`
    )
  } else {
    // Update offset even if no entries (possible blank lines appended)
    last_seen_state.set(thread_id, {
      ...tracked,
      byte_offset: result.new_byte_offset
    })
  }

  return result.entries
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Initialize timeline tracking for a new thread if timeline exists.
 * Uses streaming extraction to set initial byte offset without loading
 * the full timeline into memory.
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
    const stat = await fs.stat(timeline_path)
    last_seen_state.set(thread_id, {
      timestamp: null,
      byte_offset: stat.size
    })
    log(
      `Initialized new thread tracking for ${thread_id}: offset=${stat.size}`
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

  log(`Emitting THREAD_CREATED for thread: ${thread_id}`)
  emit_thread_created(metadata)

  // Initialize timeline tracking for this thread
  const thread_dir = path.dirname(file_path)
  await initialize_timeline_tracking_for_new_thread(thread_id, thread_dir)
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

  emit_thread_updated(metadata)
}

/**
 * Emit timeline entry events for new entries
 *
 * @param {string} thread_id - UUID of the thread
 * @param {Array} new_entries - New timeline entries
 * @param {Object} metadata - Thread metadata
 */
const emit_timeline_entry_events = (thread_id, new_entries, metadata) => {
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

  // Read metadata to get user context
  const metadata_path = path.join(path.dirname(file_path), FILE_NAMES.METADATA)
  const metadata = await read_thread_metadata(metadata_path)

  if (!metadata) {
    log(`Could not read metadata for thread ${thread_id}`)
    return
  }

  emit_timeline_entry_events(thread_id, new_entries, metadata)
}

// ============================================================================
// Watcher Setup & Management
// ============================================================================

/**
 * Create watcher configuration object
 *
 * @returns {Object} Chokidar watcher configuration
 */
const create_watcher_config = () => ({
  // Wait for file writes to finish before emitting events
  awaitWriteFinish: {
    stabilityThreshold: WATCHER_CONFIG.STABILITY_THRESHOLD_MS,
    pollInterval: WATCHER_CONFIG.POLL_INTERVAL_MS
  },
  // Only watch 2 levels deep (thread/{uuid}/file.json)
  depth: WATCHER_CONFIG.DEPTH,
  // Ignore dotfiles
  ignored: /(^|[/\\])\../,
  // Don't ignore initial add events
  ignoreInitial: true,
  // Use efficient watching (platform-specific)
  persistent: true
})

/**
 * Handle file add events
 * Only processes thread metadata files (thread/{uuid}/metadata.json)
 *
 * @param {string} file_path - Path to the added file
 */
const handle_file_add = async (file_path) => {
  log(`'add' event fired for: ${file_path}`)

  if (is_thread_metadata_file(file_path)) {
    try {
      await handle_metadata_added(file_path)
    } catch (error) {
      log(`Error in handle_metadata_added for ${file_path}:`, error)
    }
  }
}

/**
 * Handle file change events
 * Processes both metadata and timeline changes
 *
 * @param {string} file_path - Path to the changed file
 */
const handle_file_change = async (file_path) => {
  try {
    if (is_thread_metadata_file(file_path)) {
      await handle_metadata_changed(file_path)
    } else if (is_timeline_file(file_path)) {
      await handle_timeline_changed(file_path)
    }
  } catch (error) {
    log(`Error in change handler for ${file_path}:`, error)
  }
}

/**
 * Register event handlers on the watcher instance
 *
 * @param {Object} watcher_instance - Chokidar watcher instance
 */
const register_watcher_handlers = (watcher_instance) => {
  watcher_instance.on('add', handle_file_add)
  watcher_instance.on('change', handle_file_change)
  watcher_instance.on('error', (error) => {
    log('Thread watcher error:', error)
  })
  watcher_instance.on('ready', () => {
    log('Thread watcher ready and monitoring for changes')
  })
}

/**
 * Start filesystem watcher for thread directory
 *
 * @param {Object} params
 * @param {string} params.thread_directory - Absolute path to thread directory
 * @returns {Object} Watcher instance
 */
export const start_thread_watcher = ({ thread_directory }) => {
  if (watcher) {
    log('Thread watcher already running')
    return watcher
  }

  log(`Starting thread watcher for directory: ${thread_directory}`)

  try {
    // Initialize watcher with chokidar
    const config = create_watcher_config()
    watcher = chokidar.watch(thread_directory, config)

    // Register event handlers
    register_watcher_handlers(watcher)

    return watcher
  } catch (error) {
    log('Failed to start thread watcher:', error)
    throw error
  }
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
    await watcher.close()
    watcher = null
    last_seen_state.clear()
    log('Thread watcher stopped')
  } catch (error) {
    log('Error stopping thread watcher:', error)
    throw error
  }
}
