/**
 * Index Sync Watcher
 *
 * Connects the index file watcher to the embedded index manager.
 * Monitors file changes and triggers database sync operations.
 */

import debug from 'debug'

import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  start_index_file_watcher,
  stop_index_file_watcher,
  handle_entity_file_change,
  handle_entity_file_delete,
  extract_base_uri_from_entity_path,
  extract_entity_type_from_path
} from './index-file-watcher.mjs'
import { extract_thread_id_from_path } from './index-sync-filters.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import {
  write_thread_sync_request,
  write_thread_delete_request
} from './thread-sync-ipc.mjs'

const log = debug('embedded-index:sync:watcher')

/**
 * Thread sync hooks for the thread watcher.
 * These are passed to start_thread_watcher as hooks so that the thread
 * watcher's single chokidar instance handles both WebSocket events and
 * index sync, avoiding duplicate watchers on the thread/ directory.
 *
 * The on_thread_sync hook receives pre-resolved { thread_id, metadata }
 * from the thread watcher's metadata cache, debounced by thread_id to
 * coalesce metadata.json and timeline.jsonl changes into a single sync.
 */
export const thread_index_sync_hooks = {
  on_thread_sync: async ({ thread_id, metadata }) => {
    try {
      if (!thread_id) {
        log('Missing thread_id in sync hook')
        return
      }

      if (!metadata) {
        log('Missing metadata for thread: %s', thread_id)
        return
      }

      await embedded_index_manager.sync_thread({ thread_id, metadata })
      log('Synced thread: %s', thread_id)
    } catch (error) {
      log('Error syncing thread %s: %s', thread_id, error.message)
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
  }
}

/**
 * Thread sync forwarding hooks for the API process.
 * Instead of syncing directly, these write to the IPC queue file
 * so the index sync service can process them.
 * Used when the API runs with read-only database access.
 */
export const thread_sync_forwarding_hooks = {
  on_thread_sync: async ({ thread_id }) => {
    try {
      if (!thread_id) {
        log('Missing thread_id in forwarding hook')
        return
      }

      await write_thread_sync_request({ thread_id })
    } catch (error) {
      log('Error forwarding thread sync %s: %s', thread_id, error.message)
    }
  },

  on_thread_delete: async (file_path) => {
    try {
      const thread_id = extract_thread_id_from_path(file_path)
      if (!thread_id) {
        log('Could not extract thread_id from path: %s', file_path)
        return
      }

      await write_thread_delete_request({ thread_id })
    } catch (error) {
      log('Error forwarding thread delete %s: %s', file_path, error.message)
    }
  }
}

export function start_index_sync_watcher({
  on_task_change,
  on_entity_change,
  on_entity_delete,
  metrics
} = {}) {
  log('Starting index sync watcher')

  const record_failure = (counter_name, message, dedupe_key) => {
    if (metrics) {
      metrics.record_failure(counter_name, message, dedupe_key)
    } else {
      console.warn('[watcher-failure] %s', message)
    }
  }

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
        if (entity_type === 'task' && on_task_change) {
          on_task_change()
        }

        const result = await read_entity_from_filesystem({
          absolute_path: file_path
        })

        if (!result.success) {
          log('Failed to read entity %s: %s', file_path, result.error)
          record_failure(
            'watcher_entity_read_failed',
            `entity_read base_uri=${base_uri} path=${file_path} reason=${result.error}`,
            `read:${base_uri}`
          )
          return
        }

        const sync_result = await embedded_index_manager.sync_entity({
          base_uri,
          entity_data: result.entity_properties
        })
        if (sync_result && sync_result.success === false) {
          log(
            'Failed to sync entity to index (%s): %s',
            entity_type,
            base_uri
          )
          record_failure(
            'watcher_entity_sync_failed',
            `entity_sync type=${entity_type} base_uri=${base_uri} reason=${sync_result.error || 'unknown'}`,
            `sync:${base_uri}`
          )
        } else {
          log('Synced entity (%s): %s', entity_type, base_uri)
        }

        if (on_entity_change) {
          on_entity_change(file_path)
        }
      } catch (error) {
        log('Error handling entity change %s: %s', file_path, error.message)
        record_failure(
          'watcher_entity_sync_failed',
          `entity_change path=${file_path} reason=${error.message}`,
          `change:${file_path}`
        )
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
        if (entity_type === 'task' && on_task_change) {
          on_task_change()
        }

        await embedded_index_manager.remove_entity({ base_uri })
        log('Removed entity (%s): %s', entity_type, base_uri)

        if (on_entity_delete) {
          on_entity_delete(file_path)
        }
      } catch (error) {
        log('Error handling entity delete %s: %s', file_path, error.message)
        record_failure(
          'watcher_entity_delete_failed',
          `entity_delete path=${file_path} reason=${error.message}`,
          `delete:${file_path}`
        )
      }
    }
  })

  log('Index sync watcher started')
}

export {
  stop_index_file_watcher,
  handle_entity_file_change,
  handle_entity_file_delete
}
