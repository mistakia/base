import debug from 'debug'

import {
  FileBasedQueueProcessor,
  is_standalone_execution
} from '#libs-server/queue/file-based-queue-processor.mjs'
import { analyze_thread_for_metadata } from '#libs-server/metadata/analyze-thread.mjs'
import { analyze_thread_for_tags } from '#libs-server/metadata/analyze-thread-tags.mjs'

/**
 * Queue processor for thread metadata analysis
 *
 * Watches a queue file for thread IDs to process and runs metadata
 * analysis using OpenCode with local Ollama models.
 */

const QUEUE_FILE_PATH = '/tmp/claude-pending-metadata-analysis.queue'
const PROCESSED_FILE_PATH = '/tmp/claude-metadata-processed.log'

const log = debug('metadata:queue')

/**
 * Process a single thread for metadata and tag analysis
 *
 * Runs metadata analysis (title/description) first, then tag analysis.
 * Both analyses are independent - tag analysis runs even if metadata
 * analysis is skipped (e.g., metadata already exists).
 *
 * @param {string} thread_id - Thread ID to process
 * @returns {Promise<Object>} Processing result with metadata and tags status
 */
const process_thread = async (thread_id) => {
  log(`Processing thread ${thread_id}`)

  const result = {
    thread_id,
    metadata: null,
    tags: null,
    status: 'processed'
  }

  // Run metadata analysis (title/description)
  try {
    result.metadata = await analyze_thread_for_metadata({
      thread_id,
      dry_run: false
    })
    log(`Thread ${thread_id} metadata: ${result.metadata.status}`)
  } catch (error) {
    log(`Error in metadata analysis for ${thread_id}: ${error.message}`)
    result.metadata = {
      thread_id,
      status: 'error',
      error: error.message
    }
  }

  // Run tag analysis (independent of metadata result)
  try {
    result.tags = await analyze_thread_for_tags({
      thread_id,
      dry_run: false
    })
    log(`Thread ${thread_id} tags: ${result.tags.status}`)
  } catch (error) {
    log(`Error in tag analysis for ${thread_id}: ${error.message}`)
    result.tags = {
      thread_id,
      status: 'error',
      error: error.message
    }
  }

  // Determine overall status
  const metadata_success = ['updated', 'skipped'].includes(
    result.metadata?.status
  )
  const tags_success = ['updated', 'skipped'].includes(result.tags?.status)

  if (!metadata_success && !tags_success) {
    result.status = 'error'
  } else if (metadata_success && tags_success) {
    result.status = 'processed'
  } else {
    result.status = 'partial'
  }

  return result
}

// Create processor instance
const processor = new FileBasedQueueProcessor({
  name: 'metadata queue processor',
  debug_namespace: 'metadata:queue',
  queue_file_path: QUEUE_FILE_PATH,
  processed_file_path: PROCESSED_FILE_PATH,
  process_item: process_thread
})

/**
 * Start the metadata queue processor
 * @param {Object} [params] - Configuration parameters
 * @returns {Object} Watcher instance
 */
export const start_metadata_queue_processor = () => {
  return processor.start()
}

/**
 * Stop the metadata queue processor
 * @returns {Promise<void>}
 */
export const stop_metadata_queue_processor = async () => {
  return processor.stop()
}

// Standalone Execution
const is_main_module = is_standalone_execution(
  'metadata-queue-processor.mjs',
  'metadata-queue-processor'
)

if (is_main_module) {
  // Enable debug output
  if (process.env.DEBUG) {
    debug.enable(process.env.DEBUG)
  } else {
    debug.enable('metadata:*')
  }

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
