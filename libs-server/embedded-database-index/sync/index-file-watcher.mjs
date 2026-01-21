/**
 * Index File Watcher
 *
 * Monitor filesystem for entity and thread changes using chokidar.
 */

import path from 'path'
import debug from 'debug'
import chokidar from 'chokidar'

import config from '#config'
import { ENTITY_DIRECTORIES, ENTITY_FILE_PATTERN } from './sync-constants.mjs'

const log = debug('embedded-index:sync:watcher')

// Re-export for external use
export { ENTITY_DIRECTORIES }

// Store watchers in a Map for cleanup
const entity_watchers = new Map()
let thread_watcher = null
let timeline_watcher = null
let is_watching = false

// Debounce map to prevent rapid re-indexing
const debounce_timers = new Map()
const DEBOUNCE_MS = 500

function get_user_base_directory() {
  return config.user_base_directory
}

function debounced_callback(file_path, callback) {
  const existing_timer = debounce_timers.get(file_path)
  if (existing_timer) {
    clearTimeout(existing_timer)
  }

  const timer = setTimeout(() => {
    debounce_timers.delete(file_path)
    callback(file_path)
  }, DEBOUNCE_MS)

  debounce_timers.set(file_path, timer)
}

export function start_index_file_watcher({
  on_entity_change,
  on_entity_delete,
  on_thread_change,
  on_thread_delete,
  on_timeline_change
}) {
  if (is_watching) {
    log('File watcher already running')
    return
  }

  const user_base_dir = get_user_base_directory()
  if (!user_base_dir) {
    log('User base directory not configured, cannot start file watcher')
    return
  }

  log('Starting index file watcher for %s', user_base_dir)

  // Create watchers for all entity directories
  for (const entity_dir of ENTITY_DIRECTORIES) {
    const dir_path = path.join(user_base_dir, entity_dir)

    const watcher = chokidar.watch(`${dir_path}/${ENTITY_FILE_PATTERN}`, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    })

    watcher
      .on('add', (file_path) => {
        log('Entity file added (%s): %s', entity_dir, file_path)
        if (on_entity_change) {
          debounced_callback(file_path, on_entity_change)
        }
      })
      .on('change', (file_path) => {
        log('Entity file changed (%s): %s', entity_dir, file_path)
        if (on_entity_change) {
          debounced_callback(file_path, on_entity_change)
        }
      })
      .on('unlink', (file_path) => {
        log('Entity file deleted (%s): %s', entity_dir, file_path)
        if (on_entity_delete) {
          on_entity_delete(file_path)
        }
      })

    entity_watchers.set(entity_dir, watcher)
    log('Started watcher for %s directory', entity_dir)
  }

  // Watch thread directory for metadata.json files
  const thread_dir = path.join(user_base_dir, 'thread')
  thread_watcher = chokidar.watch(`${thread_dir}/*/metadata.json`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  })

  thread_watcher
    .on('add', (file_path) => {
      log('Thread metadata added: %s', file_path)
      if (on_thread_change) {
        debounced_callback(file_path, on_thread_change)
      }
    })
    .on('change', (file_path) => {
      log('Thread metadata changed: %s', file_path)
      if (on_thread_change) {
        debounced_callback(file_path, on_thread_change)
      }
    })
    .on('unlink', (file_path) => {
      log('Thread metadata deleted: %s', file_path)
      if (on_thread_delete) {
        on_thread_delete(file_path)
      }
    })

  // Watch thread directory for timeline.jsonl files
  timeline_watcher = chokidar.watch(`${thread_dir}/*/timeline.jsonl`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  })

  // Handler for all timeline events (add/change/unlink all trigger the same sync)
  const handle_timeline_event = (event_type) => (file_path) => {
    log('Thread timeline %s: %s', event_type, file_path)
    if (on_timeline_change) {
      debounced_callback(file_path, on_timeline_change)
    }
  }

  timeline_watcher
    .on('add', handle_timeline_event('added'))
    .on('change', handle_timeline_event('changed'))
    .on('unlink', handle_timeline_event('deleted'))

  is_watching = true
  log('Index file watcher started')
}

export async function stop_index_file_watcher() {
  log('Stopping index file watcher')

  // Clear all debounce timers
  for (const timer of debounce_timers.values()) {
    clearTimeout(timer)
  }
  debounce_timers.clear()

  // Close all entity watchers
  for (const [entity_dir, watcher] of entity_watchers) {
    await watcher.close()
    log('Closed watcher for %s directory', entity_dir)
  }
  entity_watchers.clear()

  // Close thread watcher
  if (thread_watcher) {
    await thread_watcher.close()
    thread_watcher = null
  }

  // Close timeline watcher
  if (timeline_watcher) {
    await timeline_watcher.close()
    timeline_watcher = null
  }

  is_watching = false
  log('Index file watcher stopped')
}

/**
 * Extract base_uri from any entity file path
 * @param {string} file_path - Absolute path to entity file
 * @returns {string|null} Base URI (e.g., user:guideline/my-guideline.md)
 */
export function extract_base_uri_from_entity_path(file_path) {
  const user_base_dir = get_user_base_directory()
  if (!user_base_dir || !file_path.startsWith(user_base_dir)) {
    return null
  }

  const relative_path = file_path.slice(user_base_dir.length + 1)
  return `user:${relative_path}`
}

/**
 * Extract entity type from file path based on directory
 * @param {string} file_path - Absolute or relative path to entity file
 * @returns {string|null} Entity type (e.g., task, guideline, tag)
 */
export function extract_entity_type_from_path(file_path) {
  const user_base_dir = get_user_base_directory()
  let relative_path = file_path

  if (user_base_dir && file_path.startsWith(user_base_dir)) {
    relative_path = file_path.slice(user_base_dir.length + 1)
  }

  // Get the first directory component
  const first_dir = relative_path.split('/')[0]

  // Check if it's an entity directory
  if (ENTITY_DIRECTORIES.includes(first_dir)) {
    return first_dir
  }

  return null
}
