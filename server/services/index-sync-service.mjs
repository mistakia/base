/**
 * Index Sync Service
 *
 * Standalone PM2 service that owns all DuckDB write operations and entity sync.
 * Isolates heavy I/O (file watching, database writes, rebuild operations) from
 * the API event loop.
 *
 * Responsibilities:
 * - DuckDB write connection (sole writer)
 * - Entity directory chokidar watcher
 * - Sync/resync/rebuild operations
 * - Sync trigger handler for CLI and API requests
 * - Thread sync requests forwarded from API via IPC
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  start_index_sync_watcher,
  stop_index_file_watcher
} from '#libs-server/embedded-database-index/sync/start-index-sync-watcher.mjs'
import {
  start_sync_trigger_watcher,
  stop_sync_trigger_watcher
} from '#libs-server/embedded-database-index/sync/sync-trigger-handler.mjs'
import {
  start_thread_sync_request_watcher,
  stop_thread_sync_request_watcher
} from '#libs-server/embedded-database-index/sync/thread-sync-ipc.mjs'

const log = debug('index-sync')

let is_running = false

/**
 * Read thread metadata from filesystem.
 * Used when processing forwarded thread sync requests from the API.
 *
 * @param {string} thread_id - Thread UUID
 * @returns {Promise<Object|null>} Parsed metadata or null
 */
async function read_thread_metadata_from_disk(thread_id) {
  const thread_dir = path.join(config.user_base_directory, 'thread')
  const metadata_path = path.join(thread_dir, thread_id, 'metadata.json')

  try {
    const content = await fs.readFile(metadata_path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    log('Failed to read metadata for thread %s: %s', thread_id, error.message)
    return null
  }
}

/**
 * Start the index sync service.
 * Initializes DuckDB in write mode, starts entity file watcher,
 * and begins listening for sync trigger requests.
 */
export const start_index_sync_service = async () => {
  if (is_running) {
    log('Index sync service already running')
    return
  }

  log('Starting index sync service')

  // Initialize embedded index manager (DuckDB in write mode)
  try {
    await embedded_index_manager.initialize()
    const status = embedded_index_manager.get_index_status()
    log('Embedded index initialized (duckdb: %s)', status.duckdb_ready)

    if (!status.duckdb_ready) {
      log('DuckDB not ready, sync service cannot operate')
      return
    }
  } catch (error) {
    log('Failed to initialize embedded index: %s', error.message)
    return
  }

  // Start entity file watcher for database sync
  const index_config = embedded_index_manager._get_index_config()
  if (index_config.file_watcher_enabled) {
    try {
      start_index_sync_watcher()
      log('Entity file watcher started')
    } catch (error) {
      log('Failed to start entity file watcher: %s', error.message)
    }
  }

  // Start sync trigger watcher for CLI and API sync requests
  try {
    start_sync_trigger_watcher({
      on_sync_request: async (request) => {
        log(
          'Processing sync request: %s (type: %s)',
          request.request_id,
          request.type
        )
        return await embedded_index_manager.perform_sync({
          mode: request.type
        })
      }
    })
    log('Sync trigger watcher started')
  } catch (error) {
    log('Failed to start sync trigger watcher: %s', error.message)
  }

  // Start thread sync request watcher for forwarded thread syncs from API
  try {
    start_thread_sync_request_watcher({
      on_thread_sync: async ({ thread_id }) => {
        let metadata = await read_thread_metadata_from_disk(thread_id)
        if (!metadata) {
          // Retry once after delay - file may still be written by another process
          await new Promise((resolve) => setTimeout(resolve, 500))
          metadata = await read_thread_metadata_from_disk(thread_id)
        }
        if (!metadata) {
          log('Skipping thread sync %s: no metadata found after retry', thread_id)
          return
        }
        await embedded_index_manager.sync_thread({ thread_id, metadata })
        log('Synced forwarded thread: %s', thread_id)
      },
      on_thread_delete: async ({ thread_id }) => {
        await embedded_index_manager.remove_thread({ thread_id })
        log('Removed forwarded thread: %s', thread_id)
      }
    })
    log('Thread sync request watcher started')
  } catch (error) {
    log('Failed to start thread sync request watcher: %s', error.message)
  }

  is_running = true
  log('Index sync service started')
}

/**
 * Stop the index sync service.
 * Shuts down watchers and closes DuckDB connection.
 */
export const stop_index_sync_service = async () => {
  if (!is_running) {
    log('Index sync service not running')
    return
  }

  log('Stopping index sync service')

  try {
    await stop_thread_sync_request_watcher()
    log('Thread sync request watcher stopped')
  } catch (error) {
    log('Error stopping thread sync request watcher: %s', error.message)
  }

  try {
    await stop_sync_trigger_watcher()
    log('Sync trigger watcher stopped')
  } catch (error) {
    log('Error stopping sync trigger watcher: %s', error.message)
  }

  try {
    await stop_index_file_watcher()
    log('Entity file watcher stopped')
  } catch (error) {
    log('Error stopping entity file watcher: %s', error.message)
  }

  try {
    await embedded_index_manager.shutdown()
    log('Embedded index shut down')
  } catch (error) {
    log('Error shutting down embedded index: %s', error.message)
  }

  is_running = false
  log('Index sync service stopped')
}

// ============================================================================
// Standalone Execution
// ============================================================================

const is_direct_execution = process.argv[1]?.endsWith(
  'index-sync-service.mjs'
)
const is_pm2_execution =
  process.env.pm_id !== undefined &&
  process.env.name === 'index-sync-service'
const is_main_module = is_direct_execution || is_pm2_execution

if (is_main_module) {
  if (process.env.DEBUG || is_pm2_execution) {
    debug.enable(process.env.DEBUG || 'index-sync*,embedded-index*')
  } else {
    debug.enable('index-sync*,embedded-index*')
  }

  log('Starting index sync service as standalone service')
  start_index_sync_service()

  const shutdown = async () => {
    log('Received shutdown signal')
    await stop_index_sync_service()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

export default start_index_sync_service
