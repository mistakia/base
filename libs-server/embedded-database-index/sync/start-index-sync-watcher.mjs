/**
 * Index Sync Watcher
 *
 * Connects the index file watcher to the embedded index manager.
 * Monitors file changes and triggers database sync operations.
 */

import path from 'path'
import debug from 'debug'
import fs from 'fs/promises'

import embedded_index_manager from '../embedded-index-manager.mjs'
import { invalidate_tasks_cache } from '#server/services/cache-warmer.mjs'
import {
  start_index_file_watcher,
  stop_index_file_watcher,
  extract_base_uri_from_entity_path,
  extract_entity_type_from_path
} from './index-file-watcher.mjs'
import { extract_thread_id_from_path } from './sync-constants.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'

const log = debug('embedded-index:sync:watcher')

async function read_thread_metadata(file_path) {
  try {
    const content = await fs.readFile(file_path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    log('Failed to read thread metadata from %s: %s', file_path, error.message)
    return null
  }
}

export function start_index_sync_watcher() {
  log('Starting index sync watcher')

  start_index_file_watcher({
    // Generic entity change handler for all entity types
    on_entity_change: async (file_path) => {
      try {
        const entity_type = extract_entity_type_from_path(file_path)
        const base_uri = extract_base_uri_from_entity_path(file_path)

        if (!base_uri) {
          log('Could not extract base_uri from path: %s', file_path)
          return
        }

        // Invalidate appropriate caches
        if (entity_type === 'task') {
          invalidate_tasks_cache()
        }

        const result = await read_entity_from_filesystem({
          absolute_path: file_path
        })

        if (!result.success) {
          log('Failed to read entity %s: %s', file_path, result.error)
          return
        }

        await embedded_index_manager.sync_entity({
          base_uri,
          entity_data: result.entity_properties
        })
        log('Synced entity (%s): %s', entity_type, base_uri)
      } catch (error) {
        log('Error handling entity change %s: %s', file_path, error.message)
      }
    },

    // Generic entity delete handler for all entity types
    on_entity_delete: async (file_path) => {
      try {
        const entity_type = extract_entity_type_from_path(file_path)
        const base_uri = extract_base_uri_from_entity_path(file_path)

        if (!base_uri) {
          log('Could not extract base_uri from path: %s', file_path)
          return
        }

        // Invalidate appropriate caches
        if (entity_type === 'task') {
          invalidate_tasks_cache()
        }

        await embedded_index_manager.remove_entity({ base_uri })
        log('Removed entity (%s): %s', entity_type, base_uri)
      } catch (error) {
        log('Error handling entity delete %s: %s', file_path, error.message)
      }
    },

    on_thread_change: async (file_path) => {
      try {
        const thread_id = extract_thread_id_from_path(file_path)
        if (!thread_id) {
          log('Could not extract thread_id from path: %s', file_path)
          return
        }

        const metadata = await read_thread_metadata(file_path)
        if (!metadata) {
          return
        }

        await embedded_index_manager.sync_thread({ thread_id, metadata })
        log('Synced thread: %s', thread_id)
      } catch (error) {
        log('Error handling thread change %s: %s', file_path, error.message)
      }
    },

    on_thread_delete: async (file_path) => {
      try {
        const thread_id = extract_thread_id_from_path(file_path)
        if (!thread_id) {
          log('Could not extract thread_id from path: %s', file_path)
          return
        }

        await embedded_index_manager.remove_thread({ thread_id })
        log('Removed thread: %s', thread_id)
      } catch (error) {
        log('Error handling thread delete %s: %s', file_path, error.message)
      }
    },

    on_timeline_change: async (file_path) => {
      try {
        const thread_id = extract_thread_id_from_path(file_path)
        if (!thread_id) {
          log('Could not extract thread_id from path: %s', file_path)
          return
        }

        // Read metadata from the same thread directory
        const metadata_path = path.join(
          path.dirname(file_path),
          'metadata.json'
        )
        const metadata = await read_thread_metadata(metadata_path)
        if (!metadata) {
          log('Could not read metadata for thread: %s', thread_id)
          return
        }

        await embedded_index_manager.sync_thread({ thread_id, metadata })
        log('Synced thread (timeline change): %s', thread_id)
      } catch (error) {
        log('Error handling timeline change %s: %s', file_path, error.message)
      }
    }
  })

  log('Index sync watcher started')
}

export { stop_index_file_watcher }
