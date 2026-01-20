import chokidar from 'chokidar'
import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import {
  emit_thread_created,
  emit_thread_updated,
  emit_thread_timeline_entry_added
} from '#libs-server/threads/event-emitter.mjs'
import { read_timeline_jsonl_or_default } from '#libs-server/threads/timeline/index.mjs'

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

// Track last-seen timeline entry timestamp per thread
// Map<thread_id, ISO timestamp string>
const last_seen_timestamps = new Map()

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

/**
 * Read and parse timeline from file
 *
 * @param {string} timeline_path - Path to timeline.jsonl
 * @returns {Promise<Array>} Timeline entries array (empty on error)
 */
const read_timeline = async (timeline_path) => {
  try {
    const timeline = await read_timeline_jsonl_or_default({
      timeline_path,
      default_value: []
    })
    return Array.isArray(timeline) ? timeline : []
  } catch (error) {
    log(`Failed to read timeline from ${timeline_path}:`, error)
    return []
  }
}

// ============================================================================
// Timeline Timestamp Management
// ============================================================================

/**
 * Find the most recent timestamp from timeline entries
 *
 * @param {Array} entries - Timeline entries
 * @returns {number} Timestamp in milliseconds (0 if no entries)
 */
const get_latest_timestamp_from_entries = (entries) => {
  return entries.reduce((latest, entry) => {
    const entry_time = new Date(entry.timestamp).getTime()
    return entry_time > latest ? entry_time : latest
  }, 0)
}

/**
 * Filter timeline entries newer than a given timestamp
 *
 * @param {Array} entries - Timeline entries
 * @param {string} after_timestamp - ISO timestamp string
 * @returns {Array} Filtered entries
 */
const filter_entries_after_timestamp = (entries, after_timestamp) => {
  const cutoff_time = new Date(after_timestamp).getTime()
  return entries.filter((entry) => {
    const entry_time = new Date(entry.timestamp).getTime()
    return entry_time > cutoff_time
  })
}

/**
 * Update last-seen timestamp for a thread
 *
 * @param {Object} params
 * @param {string} params.thread_id - UUID of the thread
 * @param {string} params.timestamp - ISO timestamp string
 */
const update_last_seen_timestamp = ({ thread_id, timestamp }) => {
  last_seen_timestamps.set(thread_id, timestamp)
  log(`Updated last seen timestamp for ${thread_id}: ${timestamp}`)
}

/**
 * Initialize timestamp tracking for a new thread
 * Sets the last-seen timestamp to the most recent entry
 *
 * @param {string} thread_id - UUID of the thread
 * @param {Array} timeline - Timeline entries
 */
const initialize_thread_timestamp = (thread_id, timeline) => {
  const latest_timestamp_ms = get_latest_timestamp_from_entries(timeline)

  if (latest_timestamp_ms > 0) {
    const iso_timestamp = new Date(latest_timestamp_ms).toISOString()
    update_last_seen_timestamp({ thread_id, timestamp: iso_timestamp })
  }
}

/**
 * Read timeline entries and detect new ones based on timestamp tracking
 *
 * @param {string} thread_id - UUID of the thread
 * @param {string} timeline_path - Path to timeline.json
 * @returns {Promise<Array>} Array of new timeline entries
 */
const detect_new_timeline_entries = async ({ thread_id, timeline_path }) => {
  const timeline = await read_timeline(timeline_path)

  if (timeline.length === 0) {
    return []
  }

  const last_timestamp = last_seen_timestamps.get(thread_id)

  // First time seeing this thread - initialize tracking and return all entries
  if (!last_timestamp) {
    initialize_thread_timestamp(thread_id, timeline)
    return timeline
  }

  // Filter for entries newer than last seen timestamp
  const new_entries = filter_entries_after_timestamp(timeline, last_timestamp)

  // Update timestamp tracking with latest new entry
  if (new_entries.length > 0) {
    const latest_new_timestamp_ms =
      get_latest_timestamp_from_entries(new_entries)
    const iso_timestamp = new Date(latest_new_timestamp_ms).toISOString()
    update_last_seen_timestamp({ thread_id, timestamp: iso_timestamp })
  }

  return new_entries
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Initialize timeline tracking for a new thread if timeline exists
 *
 * @param {string} thread_id - UUID of the thread
 * @param {string} thread_dir - Path to thread directory
 */
const initialize_timeline_tracking = async (thread_id, thread_dir) => {
  const timeline_path = path.join(thread_dir, FILE_NAMES.TIMELINE)

  try {
    await fs.access(timeline_path)
    // Timeline exists, initialize last-seen timestamp
    await detect_new_timeline_entries({ thread_id, timeline_path })
  } catch {
    // Timeline doesn't exist yet, that's ok
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
  await initialize_timeline_tracking(thread_id, thread_dir)
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
    last_seen_timestamps.clear()
    log('Thread watcher stopped')
  } catch (error) {
    log('Error stopping thread watcher:', error)
    throw error
  }
}
