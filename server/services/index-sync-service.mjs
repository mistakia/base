/**
 * Index Sync Service
 *
 * Standalone PM2 service that owns all SQLite write operations and entity sync.
 * Isolates heavy I/O (file watching, database writes, rebuild operations) from
 * the API event loop.
 *
 * Responsibilities:
 * - SQLite write connection (sole writer)
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
  stop_index_file_watcher,
  handle_entity_file_change,
  handle_entity_file_delete
} from '#libs-server/embedded-database-index/sync/start-index-sync-watcher.mjs'
import {
  start_user_base_watcher,
  stop_user_base_watcher
} from '#libs-server/file-subscriptions/user-base-watcher.mjs'
import {
  start_sync_trigger_watcher,
  stop_sync_trigger_watcher
} from '#libs-server/embedded-database-index/sync/sync-trigger-handler.mjs'
import {
  start_thread_sync_request_watcher,
  stop_thread_sync_request_watcher
} from '#libs-server/embedded-database-index/sync/thread-sync-ipc.mjs'
import {
  initialize_embedding_pipeline,
  handle_embedding_file_change,
  handle_embedding_file_delete
} from '#libs-server/search/embedding-pipeline.mjs'
import { create_sync_metrics } from '#libs-server/embedded-database-index/sync/sync-metrics.mjs'

const log = debug('index-sync')

const SERVER_LOCK_FILE = '.server-lock'

const WAL_CHECKPOINT_INTERVAL_MS = 600000 // 10 minutes

let is_running = false
let metrics = null
let wal_checkpoint_interval = null

/**
 * Write server lock file to indicate the sync service is the active writer.
 * CLI tools use this lock file to detect whether to use IPC or direct mode.
 */
async function write_server_lock_file() {
  const lock_path = path.join(
    config.user_base_directory,
    'embedded-database-index',
    SERVER_LOCK_FILE
  )

  const lock_data = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    service: 'index-sync-service'
  }

  try {
    const dir = path.dirname(lock_path)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(lock_path, JSON.stringify(lock_data, null, 2))
    log('Lock file written: %s', lock_path)
  } catch (error) {
    log('Failed to write lock file: %s', error.message)
  }
}

/**
 * Remove server lock file on shutdown.
 */
async function remove_server_lock_file() {
  const lock_path = path.join(
    config.user_base_directory,
    'embedded-database-index',
    SERVER_LOCK_FILE
  )

  try {
    await fs.unlink(lock_path)
    log('Lock file removed')
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('Failed to remove lock file: %s', error.message)
    }
  }
}

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
 * Initializes SQLite in write mode, starts entity file watcher,
 * and begins listening for sync trigger requests.
 */
export const start_index_sync_service = async () => {
  if (is_running) {
    log('Index sync service already running')
    return
  }

  log('Starting index sync service')
  const startup_start = Date.now()

  // Initialize embedded index manager (SQLite in write mode)
  try {
    await embedded_index_manager.initialize()
    const status = embedded_index_manager.get_index_status()
    log('Embedded index initialized (sqlite: %s)', status.sqlite_ready)

    if (!status.sqlite_ready) {
      log('SQLite not ready, sync service cannot operate')
      return
    }
  } catch (error) {
    log('Failed to initialize embedded index: %s', error.message)
    return
  }

  // Initialize metrics collector
  metrics = create_sync_metrics({
    get_sqlite_ready: () => embedded_index_manager.is_sqlite_ready(),
    get_cache_size: () => embedded_index_manager._timeline_sync_cache.size
  })
  embedded_index_manager.set_metrics(metrics)
  metrics.start()

  // Write lock file to indicate sync service is the active writer
  await write_server_lock_file()

  // Initialize embedding pipeline for semantic search
  try {
    initialize_embedding_pipeline({
      user_base_directory: config.user_base_directory
    })
    log('Embedding pipeline initialized')
  } catch (error) {
    log('Failed to initialize embedding pipeline: %s', error.message)
  }

  // Start entity file watcher for database sync (with embedding callbacks)
  const index_config = embedded_index_manager.get_index_config()
  if (index_config.file_watcher_enabled) {
    try {
      start_index_sync_watcher({
        on_entity_change: (file_path) => {
          handle_embedding_file_change(file_path)
        },
        on_entity_delete: (file_path) => {
          handle_embedding_file_delete(file_path).catch((error) => {
            log('Embedding delete failed for %s: %s', file_path, error.message)
          })
        }
      })
      log('Entity file watcher started')
    } catch (error) {
      log('Failed to start entity file watcher: %s', error.message)
    }
  }

  // Start user-base-watcher for real-time entity file change detection.
  // The index file watcher only stores callbacks; user-base-watcher provides
  // the actual filesystem subscription that triggers them.
  try {
    await start_user_base_watcher({
      user_base_directory: config.user_base_directory,
      entity_index: {
        on_change: (absolute_path) => {
          handle_entity_file_change(absolute_path)
        },
        on_delete: (absolute_path) => {
          handle_entity_file_delete(absolute_path)
        }
      },
      metrics
    })
    log('User-base watcher started for entity file detection')
  } catch (error) {
    log('Failed to start user-base watcher: %s', error.message)
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
      metrics,
      on_overflow: async () => {
        log('Thread IPC overflow recovery: re-syncing all threads')
        await embedded_index_manager._populate_threads_from_filesystem()
        log('Thread IPC overflow recovery complete')
      },
      on_thread_sync: async ({ thread_id }) => {
        let metadata = await read_thread_metadata_from_disk(thread_id)
        if (!metadata) {
          // Retry once after delay - file may still be written by another process
          await new Promise((resolve) => setTimeout(resolve, 500))
          metadata = await read_thread_metadata_from_disk(thread_id)
        }
        if (!metadata) {
          log(
            'Skipping thread sync %s: no metadata found after retry',
            thread_id
          )
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

  // Periodic WAL checkpoint to prevent unbounded WAL growth
  wal_checkpoint_interval = setInterval(async () => {
    try {
      await embedded_index_manager.checkpoint()
      log('Periodic WAL checkpoint completed')
    } catch (error) {
      log('WAL checkpoint failed: %s', error.message)
    }
  }, WAL_CHECKPOINT_INTERVAL_MS)
  if (wal_checkpoint_interval.unref) wal_checkpoint_interval.unref()

  is_running = true
  metrics.timing('startup', Date.now() - startup_start)
  log('Index sync service started')
}

/**
 * Stop the index sync service.
 * Shuts down watchers and closes SQLite connection.
 */
export const stop_index_sync_service = async () => {
  if (!is_running) {
    log('Index sync service not running')
    return
  }

  log('Stopping index sync service')

  if (wal_checkpoint_interval) {
    clearInterval(wal_checkpoint_interval)
    wal_checkpoint_interval = null
  }

  if (metrics) {
    metrics.stop()
  }

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
    await stop_user_base_watcher()
    log('User-base watcher stopped')
  } catch (error) {
    log('Error stopping user-base watcher: %s', error.message)
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

  await remove_server_lock_file()

  is_running = false
  log('Index sync service stopped')
}

// ============================================================================
// Standalone Execution
// ============================================================================

const is_direct_execution = process.argv[1]?.endsWith('index-sync-service.mjs')
const is_pm2_execution =
  process.env.pm_id !== undefined && process.env.name === 'index-sync-service'
const is_main_module = is_direct_execution || is_pm2_execution

if (is_main_module) {
  if (process.env.DEBUG || is_pm2_execution) {
    debug.enable(process.env.DEBUG || 'index-sync*,embedded-index*')
  } else {
    debug.enable('index-sync*,embedded-index*')
  }

  log('Starting index sync service as standalone service')
  start_index_sync_service()

  const shutdown = async (reason) => {
    log('Shutting down (%s)', reason)
    await stop_index_sync_service()
    process.exit(reason === 'SIGINT' || reason === 'SIGTERM' ? 0 : 1)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  process.on('uncaughtException', (error) => {
    log('Uncaught exception: %s', error.message)
    log('%s', error.stack)
    shutdown('uncaughtException')
  })

  process.on('unhandledRejection', (reason) => {
    log('Unhandled rejection: %O', reason)
    shutdown('unhandledRejection')
  })
}

export default start_index_sync_service
