/**
 * Index Sync Watcher
 *
 * Connects the index file watcher to the embedded index manager.
 * Monitors file changes and triggers database sync operations.
 */

import debug from 'debug'
import fs from 'fs/promises'

import embedded_index_manager from '../embedded-index-manager.mjs'
import {
  invalidate_tasks_cache,
  invalidate_threads_cache
} from '#server/services/cache-warmer.mjs'
import {
  start_index_file_watcher,
  stop_index_file_watcher,
  extract_thread_id_from_path,
  extract_base_uri_from_task_path
} from './index-file-watcher.mjs'
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
    on_task_change: async (file_path) => {
      try {
        // Invalidate HTTP cache for public task list requests
        invalidate_tasks_cache()

        const base_uri = extract_base_uri_from_task_path(file_path)
        if (!base_uri) {
          log('Could not extract base_uri from path: %s', file_path)
          return
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
        log('Synced task: %s', base_uri)
      } catch (error) {
        log('Error handling task change %s: %s', file_path, error.message)
      }
    },

    on_task_delete: async (file_path) => {
      try {
        // Invalidate HTTP cache for public task list requests
        invalidate_tasks_cache()

        const base_uri = extract_base_uri_from_task_path(file_path)
        if (!base_uri) {
          log('Could not extract base_uri from path: %s', file_path)
          return
        }

        await embedded_index_manager.remove_entity({ base_uri })
        log('Removed task: %s', base_uri)
      } catch (error) {
        log('Error handling task delete %s: %s', file_path, error.message)
      }
    },

    on_thread_change: async (file_path) => {
      try {
        // Invalidate HTTP cache for public thread list requests
        invalidate_threads_cache()

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
        // Invalidate HTTP cache for public thread list requests
        invalidate_threads_cache()

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

    on_tag_change: async (file_path) => {
      // Tags are synced via entity relations when entities reference them
      // No direct tag indexing needed at this time
      log('Tag changed: %s', file_path)
    },

    on_tag_delete: async (file_path) => {
      // Tag deletion handling - relations are cleaned up when entities are synced
      log('Tag deleted: %s', file_path)
    }
  })

  log('Index sync watcher started')
}

export { stop_index_file_watcher }
