import path from 'path'
import debug from 'debug'

import config from '#config'
import {
  FileBasedQueueProcessor,
  is_standalone_execution
} from '#libs-server/queue/file-based-queue-processor.mjs'
import {
  analyze_thread_relations,
  RELATION_ANALYSIS_CONFIG
} from '#libs-server/metadata/analyze-thread-relations.mjs'
import { inspect_lease } from '#libs-server/threads/lease-client.mjs'

/**
 * Queue processor for thread relation analysis
 *
 * Watches a queue file for thread IDs to process and runs relation
 * analysis to extract entity references from thread timelines.
 *
 * Queue and processed-log paths come from `config.metadata_queue` and
 * mirror the resolution logic used by `metadata-queue-processor.mjs`.
 */

const resolve_queue_path = (configured_path, fallback) => {
  if (!configured_path) return fallback
  if (path.isAbsolute(configured_path)) return configured_path
  if (config.user_base_directory) {
    return path.join(config.user_base_directory, configured_path)
  }
  return fallback
}

const QUEUE_FILE_PATH = RELATION_ANALYSIS_CONFIG.QUEUE_FILE_PATH
const PROCESSED_FILE_PATH = resolve_queue_path(
  config.metadata_queue?.relation_processed_file_path,
  '/tmp/claude-relation-analysis-processed.log'
)

const _is_lease_active = (snapshot) =>
  Boolean(snapshot) && snapshot.expires_at > Date.now()

/**
 * Process a single thread for relation analysis
 * @param {string} thread_id - Thread ID to process
 * @returns {Promise<Object>} Processing result
 */
const process_thread = async (thread_id) => {
  // Defer when an active session holds the lease to avoid racing live writes.
  // Returns 'partial' so the processor re-queues with backoff rather than dropping the item.
  try {
    const lease = await inspect_lease({ thread_id })
    if (_is_lease_active(lease)) {
      return { thread_id, status: 'partial' }
    }
  } catch (err) {
    const log = debug('metadata:relation-queue')
    log(`Failed to inspect lease for ${thread_id}: ${err.message}`)
  }

  const result = await analyze_thread_relations({
    thread_id,
    dry_run: false
  })
  return result
}

/**
 * Format log details for processed entries
 * @param {Object} result - Processing result
 * @returns {string} Formatted details string
 */
const format_log_details = (result) => {
  const details = {
    entity_relations: result.entity_relations_count,
    total: result.total_relations_count
  }
  return JSON.stringify(details)
}

// Create processor instance
const processor = new FileBasedQueueProcessor({
  name: 'relation analysis queue processor',
  debug_namespace: 'metadata:relation-queue',
  queue_file_path: QUEUE_FILE_PATH,
  processed_file_path: PROCESSED_FILE_PATH,
  process_item: process_thread,
  format_log_details
})

/**
 * Start the relation analysis queue processor
 */
export const start_relation_analysis_queue_processor = () => {
  processor.start()
}

/**
 * Stop the relation analysis queue processor
 * @returns {Promise<void>}
 */
export const stop_relation_analysis_queue_processor = async () => {
  return processor.stop()
}

// Standalone Execution
const is_main_module = is_standalone_execution(
  'relation-analysis-queue-processor.mjs',
  'relation-analysis-queue-processor'
)

if (is_main_module) {
  // Enable debug output
  if (process.env.DEBUG) {
    debug.enable(process.env.DEBUG)
  } else {
    debug.enable('metadata:*')
  }

  const log = debug('metadata:relation-queue')
  log('Starting relation analysis queue processor as standalone service')
  start_relation_analysis_queue_processor()

  // Handle graceful shutdown
  const shutdown = async () => {
    log('Received shutdown signal')
    await stop_relation_analysis_queue_processor()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

export default start_relation_analysis_queue_processor
