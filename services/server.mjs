import debug from 'debug'
import path from 'path'

import server from '#server/index.mjs'
import config from '#config'
import {
  start_thread_watcher,
  stop_thread_watcher
} from '#server/services/thread-watcher.mjs'
import { start_worker, stop_worker } from '#libs-server/threads/job-worker.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  start_index_sync_watcher,
  stop_index_file_watcher
} from '#libs-server/embedded-database-index/sync/start-index-sync-watcher.mjs'
import {
  start_cache_warmer,
  stop_cache_warmer
} from '#server/services/cache-warmer.mjs'

const logger = debug('server')
debug.enable('server,api,threads:*,embedded-index*')

try {
  const { server_port } = config
  server.listen(server_port, async () => {
    logger(`API listening on port ${server_port}`)

    // Initialize thread watcher after server starts
    try {
      const thread_directory = path.join(config.user_base_directory, 'thread')
      start_thread_watcher({ thread_directory })
      logger('Thread watcher initialized')
    } catch (watcher_error) {
      logger(`Failed to start thread watcher: ${watcher_error.message}`)
      logger(watcher_error)
    }

    // Initialize job worker for thread creation queue
    try {
      await start_worker()
      const max_concurrent = config.threads?.queue?.max_concurrent_jobs || 3
      logger(`Job worker initialized with concurrency: ${max_concurrent}`)
    } catch (worker_error) {
      logger(`Failed to start job worker: ${worker_error.message}`)
      logger(worker_error)
    }

    // Initialize embedded database index
    try {
      await embedded_index_manager.initialize()
      const status = embedded_index_manager.get_index_status()
      logger(
        `Embedded index initialized (kuzu: ${status.kuzu_ready}, duckdb: ${status.duckdb_ready})`
      )
    } catch (index_error) {
      logger(`Failed to initialize embedded index: ${index_error.message}`)
      logger(index_error)
    }

    // Start index file watcher for database sync
    try {
      const index_config = embedded_index_manager._get_index_config()
      if (index_config.enabled && index_config.file_watcher_enabled) {
        start_index_sync_watcher()
        logger('Index file watcher started')
      }
    } catch (watcher_error) {
      logger(`Failed to start index file watcher: ${watcher_error.message}`)
      logger(watcher_error)
    }

    // Start cache warmer service for proactive cache maintenance
    try {
      await start_cache_warmer()
      logger('Cache warmer service started')
    } catch (cache_error) {
      logger(`Failed to start cache warmer: ${cache_error.message}`)
      logger(cache_error)
    }
  })
} catch (err) {
  // TODO move to stderr
  logger(err)
}

// Graceful shutdown handlers
const shutdown = async (signal) => {
  logger(`Received ${signal}, shutting down gracefully...`)

  try {
    // Stop job worker
    await stop_worker()
    logger('Job worker stopped')
  } catch (error) {
    logger(`Error stopping job worker: ${error.message}`)
  }

  try {
    // Stop thread watcher
    await stop_thread_watcher()
    logger('Thread watcher stopped')
  } catch (error) {
    logger(`Error stopping thread watcher: ${error.message}`)
  }

  try {
    // Stop index file watcher
    await stop_index_file_watcher()
    logger('Index file watcher stopped')
  } catch (error) {
    logger(`Error stopping index file watcher: ${error.message}`)
  }

  try {
    // Shutdown embedded index
    await embedded_index_manager.shutdown()
    logger('Embedded index shut down')
  } catch (error) {
    logger(`Error shutting down embedded index: ${error.message}`)
  }

  try {
    // Stop cache warmer service
    stop_cache_warmer()
    logger('Cache warmer service stopped')
  } catch (error) {
    logger(`Error stopping cache warmer: ${error.message}`)
  }

  // Close server
  server.close(() => {
    logger('Server closed')
    process.exit(0)
  })

  // Force exit after 10 seconds if server hasn't closed
  setTimeout(() => {
    logger('Forcing shutdown after timeout')
    process.exit(1)
  }, 10000)
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
