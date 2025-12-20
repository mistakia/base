import chokidar from 'chokidar'
import fs from 'fs/promises'
import debug from 'debug'

import { analyze_thread_for_metadata } from '#libs-server/metadata/analyze-thread.mjs'

const log = debug('metadata:queue')

/**
 * Queue processor for thread metadata analysis
 *
 * Watches a queue file for thread IDs to process and runs metadata
 * analysis using OpenCode with local Ollama models.
 */

// ============================================================================
// Constants
// ============================================================================

const QUEUE_CONFIG = {
  QUEUE_FILE_PATH: '/tmp/claude-pending-metadata-analysis.queue',
  PROCESSED_FILE_PATH: '/tmp/claude-metadata-processed.log',
  STABILITY_THRESHOLD_MS: 1000,
  POLL_INTERVAL_MS: 100,
  PROCESS_DELAY_MS: 2000 // Wait before processing to batch entries
}

// ============================================================================
// State Management
// ============================================================================

let watcher = null
let process_timeout = null
let is_processing = false

// ============================================================================
// Queue File Operations
// ============================================================================

/**
 * Read thread IDs from the queue file
 *
 * @returns {Promise<string[]>} Array of thread IDs
 */
const read_queue_file = async () => {
  try {
    const content = await fs.readFile(QUEUE_CONFIG.QUEUE_FILE_PATH, 'utf-8')
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    // Deduplicate
    return [...new Set(lines)]
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }
    log(`Failed to read queue file: ${error.message}`)
    throw error
  }
}

/**
 * Write thread IDs back to the queue file
 *
 * @param {string[]} thread_ids - Thread IDs to write
 */
const write_queue_file = async (thread_ids) => {
  const content = thread_ids.join('\n') + (thread_ids.length > 0 ? '\n' : '')
  await fs.writeFile(QUEUE_CONFIG.QUEUE_FILE_PATH, content, 'utf-8')
}

/**
 * Remove a thread ID from the queue
 *
 * @param {string} thread_id - Thread ID to remove
 */
const remove_from_queue = async (thread_id) => {
  const queue = await read_queue_file()
  const updated = queue.filter((id) => id !== thread_id)
  await write_queue_file(updated)
  log(`Removed ${thread_id} from queue`)
}

/**
 * Log a processed thread ID
 *
 * @param {string} thread_id - Thread ID that was processed
 * @param {string} status - Processing status
 */
const log_processed = async (thread_id, status) => {
  const timestamp = new Date().toISOString()
  const entry = `${timestamp}\t${thread_id}\t${status}\n`

  try {
    await fs.appendFile(QUEUE_CONFIG.PROCESSED_FILE_PATH, entry, 'utf-8')
  } catch (error) {
    log(`Failed to log processed thread: ${error.message}`)
  }
}

// ============================================================================
// Processing Logic
// ============================================================================

/**
 * Process a single thread for metadata analysis
 *
 * @param {string} thread_id - Thread ID to process
 * @returns {Promise<Object>} Processing result
 */
const process_thread = async (thread_id) => {
  log(`Processing thread ${thread_id}`)

  try {
    const result = await analyze_thread_for_metadata({
      thread_id,
      dry_run: false
    })

    log(`Thread ${thread_id} result: ${result.status}`)
    return result
  } catch (error) {
    log(`Error processing thread ${thread_id}: ${error.message}`)
    return {
      thread_id,
      status: 'error',
      error: error.message
    }
  }
}

/**
 * Process all threads in the queue
 */
const process_queue = async () => {
  if (is_processing) {
    log('Already processing, skipping')
    return
  }

  is_processing = true

  try {
    const queue = await read_queue_file()

    if (queue.length === 0) {
      log('Queue is empty')
      return
    }

    log(`Processing ${queue.length} threads from queue`)

    for (const thread_id of queue) {
      const result = await process_thread(thread_id)

      // Remove from queue regardless of result
      await remove_from_queue(thread_id)

      // Log the result
      await log_processed(thread_id, result.status)

      // Brief delay between processing to avoid overwhelming Ollama
      if (queue.indexOf(thread_id) < queue.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    log('Queue processing complete')
  } catch (error) {
    log(`Queue processing failed: ${error.message}`)
  } finally {
    is_processing = false
  }
}

/**
 * Schedule queue processing with debounce
 */
const schedule_processing = () => {
  if (process_timeout) {
    clearTimeout(process_timeout)
  }

  process_timeout = setTimeout(() => {
    process_queue()
  }, QUEUE_CONFIG.PROCESS_DELAY_MS)
}

// ============================================================================
// Queue File Change Handler
// ============================================================================

/**
 * Handle queue file changes
 *
 * @param {string} event_type - Chokidar event type
 * @param {string} file_path - Path to the changed file
 */
const handle_queue_file_change = (event_type, file_path) => {
  log(`Queue file ${event_type}: ${file_path}`)
  schedule_processing()
}

// ============================================================================
// Watcher Setup & Management
// ============================================================================

/**
 * Create watcher configuration
 *
 * @returns {Object} Chokidar configuration
 */
const create_watcher_config = () => ({
  awaitWriteFinish: {
    stabilityThreshold: QUEUE_CONFIG.STABILITY_THRESHOLD_MS,
    pollInterval: QUEUE_CONFIG.POLL_INTERVAL_MS
  },
  persistent: true,
  ignoreInitial: false
})

/**
 * Start the metadata queue processor
 *
 * @param {Object} [params] - Configuration parameters
 * @returns {Object} Watcher instance
 */
export const start_metadata_queue_processor = (params = {}) => {
  if (watcher) {
    log('Metadata queue processor already running')
    return watcher
  }

  log('Starting metadata queue processor')
  log(`Watching: ${QUEUE_CONFIG.QUEUE_FILE_PATH}`)

  try {
    const config = create_watcher_config()
    watcher = chokidar.watch(QUEUE_CONFIG.QUEUE_FILE_PATH, config)

    watcher.on('add', (path) => handle_queue_file_change('add', path))
    watcher.on('change', (path) => handle_queue_file_change('change', path))
    watcher.on('error', (error) => {
      log('Queue watcher error:', error)
    })
    watcher.on('ready', () => {
      log('Metadata queue processor ready')
      // Process any existing queue entries on startup
      schedule_processing()
    })

    return watcher
  } catch (error) {
    log('Failed to start metadata queue processor:', error)
    throw error
  }
}

/**
 * Stop the metadata queue processor
 *
 * @returns {Promise<void>}
 */
export const stop_metadata_queue_processor = async () => {
  if (!watcher) {
    log('No metadata queue processor to stop')
    return
  }

  log('Stopping metadata queue processor')

  if (process_timeout) {
    clearTimeout(process_timeout)
    process_timeout = null
  }

  try {
    await watcher.close()
    watcher = null
    log('Metadata queue processor stopped')
  } catch (error) {
    log('Error stopping metadata queue processor:', error)
    throw error
  }
}

// ============================================================================
// Standalone Execution
// ============================================================================

// Run as standalone service when executed directly
const is_main_module = process.argv[1]?.endsWith('metadata-queue-processor.mjs')

if (is_main_module) {
  debug.enable('metadata:*')

  log('Starting metadata queue processor as standalone service')
  start_metadata_queue_processor()

  // Handle graceful shutdown
  const shutdown = async () => {
    log('Received shutdown signal')
    await stop_metadata_queue_processor()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

export default start_metadata_queue_processor
