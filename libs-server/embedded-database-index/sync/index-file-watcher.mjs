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
import { create_keyed_debouncer } from '#libs-server/utils/debounce-by-key.mjs'

const log = debug('embedded-index:sync:watcher')

// Re-export for external use
export { ENTITY_DIRECTORIES }

// Single consolidated watcher for all entity directories
let entity_watcher = null
let is_watching = false

// Debounce to prevent rapid re-indexing
const entity_debouncer = create_keyed_debouncer(500)

function get_user_base_directory() {
  return config.user_base_directory
}

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

  log('Starting index file watcher for %s', user_base_dir)

  // Build watch paths for all entity directories
  const watch_paths = ENTITY_DIRECTORIES.map(
    (dir) => `${path.join(user_base_dir, dir)}/${ENTITY_FILE_PATTERN}`
  )

  // Single consolidated watcher for all entity directories
  entity_watcher = chokidar.watch(watch_paths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  })

  entity_watcher
    .on('add', (file_path) => {
      log('Entity file added: %s', file_path)
      if (on_entity_change) {
        entity_debouncer.call(file_path, on_entity_change)
      }
    })
    .on('change', (file_path) => {
      log('Entity file changed: %s', file_path)
      if (on_entity_change) {
        entity_debouncer.call(file_path, on_entity_change)
      }
    })
    .on('unlink', (file_path) => {
      log('Entity file deleted: %s', file_path)
      if (on_entity_delete) {
        on_entity_delete(file_path)
      }
    })

  log('Started watcher for %d entity directories', ENTITY_DIRECTORIES.length)

  // Thread and timeline watchers are handled by the thread watcher
  // (server/services/thread-watcher.mjs) via hooks to avoid duplicate
  // chokidar instances on the thread/ directory.

  is_watching = true
  log('Index file watcher started')
}

export async function stop_index_file_watcher() {
  log('Stopping index file watcher')

  // Clear all debounce timers
  entity_debouncer.clear_all()

  // Close entity watcher
  if (entity_watcher) {
    await entity_watcher.close()
    entity_watcher = null
    log('Closed entity watcher')
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
