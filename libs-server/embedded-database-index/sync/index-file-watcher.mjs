/**
 * Index File Watcher
 *
 * Monitor filesystem for entity changes and trigger embedded index sync.
 * Actual file watching is handled by the consolidated user-base-watcher;
 * this module provides the event handlers with debouncing.
 */

import debug from 'debug'

import config from '#config'
import { ENTITY_DIRECTORIES } from './index-sync-filters.mjs'
import { create_keyed_debouncer } from '#libs-server/utils/debounce-by-key.mjs'

const log = debug('embedded-index:sync:watcher')

// Re-export for external use
export { ENTITY_DIRECTORIES }

let is_watching = false

// Stored callbacks from start_index_file_watcher
let stored_on_entity_change = null
let stored_on_entity_delete = null

// Debounce to prevent rapid re-indexing
const entity_debouncer = create_keyed_debouncer(500, {
  on_error: (error, key) => {
    log('Debounced entity sync error for %s: %s', key, error.message)
  }
})

function get_user_base_directory() {
  return config.user_base_directory
}

/**
 * Initialize the index file watcher.
 * Stores callbacks for entity change/delete events.
 * Actual file watching is handled by user-base-watcher.
 */
export function start_index_file_watcher({
  on_entity_change,
  on_entity_delete
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

  stored_on_entity_change = on_entity_change
  stored_on_entity_delete = on_entity_delete

  log(
    'Index file watcher initialized for %d entity directories (watching via user-base-watcher)',
    ENTITY_DIRECTORIES.length
  )

  is_watching = true
  log('Index file watcher started')
}

/**
 * Handle an entity file change event from user-base-watcher.
 * Applies debouncing per file path.
 *
 * @param {string} file_path - Absolute path to the changed entity file
 */
export function handle_entity_file_change(file_path) {
  log('Entity file changed: %s', file_path)
  if (stored_on_entity_change) {
    entity_debouncer.call(file_path, stored_on_entity_change)
  }
}

/**
 * Handle an entity file delete event from user-base-watcher.
 *
 * @param {string} file_path - Absolute path to the deleted entity file
 */
export function handle_entity_file_delete(file_path) {
  log('Entity file deleted: %s', file_path)
  if (stored_on_entity_delete) {
    stored_on_entity_delete(file_path)
  }
}

export function stop_index_file_watcher() {
  log('Stopping index file watcher')

  // Clear all debounce timers
  entity_debouncer.clear_all()

  stored_on_entity_change = null
  stored_on_entity_delete = null

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
