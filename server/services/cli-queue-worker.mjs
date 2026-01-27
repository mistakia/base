import debug from 'debug'

import {
  start_cli_queue_worker,
  stop_cli_queue_worker,
  close_cli_queue
} from '#libs-server/cli-queue/index.mjs'

const log = debug('cli-queue:service')

/**
 * CLI Queue Worker Service
 *
 * PM2-managed worker process that processes CLI command jobs
 * from the Redis queue with tag-based concurrency control.
 */

// ============================================================================
// Lifecycle Management
// ============================================================================

let is_shutting_down = false

/**
 * Initialize and start the worker
 */
const start = () => {
  log('Starting CLI queue worker service')
  start_cli_queue_worker()
  log('CLI queue worker service started')
}

/**
 * Graceful shutdown handler
 */
const shutdown = async (signal) => {
  if (is_shutting_down) {
    log('Shutdown already in progress')
    return
  }

  is_shutting_down = true
  log(`Received ${signal}, shutting down gracefully...`)

  try {
    await stop_cli_queue_worker()
    await close_cli_queue()
    log('Shutdown complete')
    process.exit(0)
  } catch (error) {
    log(`Error during shutdown: ${error.message}`)
    process.exit(1)
  }
}

// ============================================================================
// Signal Handlers
// ============================================================================

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`)
  log(error.stack)
  shutdown('uncaughtException')
})

process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection: ${reason}`)
  shutdown('unhandledRejection')
})

// ============================================================================
// Entry Point
// ============================================================================

start()
