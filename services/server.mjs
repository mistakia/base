import debug from 'debug'
import path from 'path'

import server from '#server/index.mjs'
import config from '#config'
import {
  start_thread_watcher,
  stop_thread_watcher
} from '#server/services/thread-watcher.mjs'
import { start_worker, stop_worker } from '#libs-server/threads/job-worker.mjs'

const logger = debug('server')
debug.enable('server,api,threads:*')

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
