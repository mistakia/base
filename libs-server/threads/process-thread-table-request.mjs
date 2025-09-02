/**
 * @fileoverview Server-side table request processing for threads
 */

import debug from 'debug'
import path from 'path'
import list_threads from '#libs-server/threads/list-threads.mjs'
import { extract_thread_metadata } from '#libs-server/threads/thread-metadata-extractor.mjs'
import { process_generic_table_request } from '#libs-server/table-processing/process-table-request.mjs'
import { DATA_TYPES } from '#libs-server/table-processing/sorting-utilities.mjs'
import { check_user_permission } from '#server/middleware/permission-checker.mjs'
import { redact_entity_object } from '#server/middleware/content-redactor.mjs'
import { get_thread_base_directory } from './threads-constants.mjs'
import { read_json_file } from './thread-utils.mjs'

const log = debug('threads:table')

/**
 * Column type mapping for thread data
 */
const THREAD_COLUMN_TYPES = {
  created_at: DATA_TYPES.DATE,
  updated_at: DATA_TYPES.DATE,
  duration_ms: DATA_TYPES.NUMBER
}

/**
 * Keys to preserve when redacting thread data
 */
const PRESERVED_KEYS = ['thread_id', 'thread_state', 'created_at', 'updated_at']

/**
 * Keys to redact when user lacks permission
 */
const REDACTED_KEYS = [
  'title',
  'short_description',
  'thread_main_request',
  'user_public_key'
]

/**
 * Default sorting configuration for thread tables
 */
const DEFAULT_SORT = {
  column_id: 'created_at',
  desc: true
}

/**
 * Check if user has permission to view a thread
 *
 * @param {string} requesting_user_public_key - User's public key
 * @param {string} thread_id - Thread ID to check
 * @returns {Promise<boolean>} Whether user has permission
 */
async function check_thread_permission(requesting_user_public_key, thread_id) {
  try {
    // First check if thread has public_read enabled (highest precedence)
    const threads_dir = get_thread_base_directory()
    const metadata_path = path.join(threads_dir, thread_id, 'metadata.json')

    try {
      const metadata = await read_json_file({ file_path: metadata_path })

      // If public_read is explicitly set to true, grant read access immediately
      if (metadata.public_read === true) {
        log(`Thread ${thread_id} has public_read enabled, granting access`)
        return true
      }
    } catch (metadata_error) {
      log(
        `Error reading metadata for thread ${thread_id}: ${metadata_error.message}`
      )
      // Fall through to user-based permission check if metadata can't be read
    }

    // Fall back to user-based permission check if public_read is not enabled
    if (!requesting_user_public_key) {
      return false
    }

    const thread_resource_path = `user:thread/${thread_id}`
    const permission_result = await check_user_permission({
      user_public_key: requesting_user_public_key,
      resource_path: thread_resource_path
    })

    return permission_result.allowed
  } catch (error) {
    log(`Error checking permission for thread ${thread_id}: ${error.message}`)
    return false
  }
}

/**
 * Apply redaction to thread data when user lacks permission
 *
 * @param {Object} thread - Thread object to redact
 * @returns {Object} Redacted thread object
 */
function redact_thread_data(thread) {
  return redact_entity_object(thread, {
    preserve_keys: PRESERVED_KEYS,
    redact_keys: REDACTED_KEYS
  })
}

/**
 * Process threads with permission checking and redaction
 *
 * @param {Array} threads - Array of thread objects
 * @param {string} requesting_user_public_key - User's public key
 * @returns {Promise<Array>} Processed threads with permissions applied
 */
async function process_threads_with_permissions(
  threads,
  requesting_user_public_key
) {
  return Promise.all(
    threads.map(async (thread) => {
      const has_permission = await check_thread_permission(
        requesting_user_public_key,
        thread.thread_id
      )

      return has_permission ? thread : redact_thread_data(thread)
    })
  )
}

/**
 * Normalize table result to unified response format
 *
 * @param {Object} result - Result from generic table processing
 * @param {Object} table_state - Original table state
 * @returns {Object} Normalized response
 */
function normalize_table_response(result, table_state) {
  return {
    rows: result.data,
    total_row_count: result.total_count,
    metadata: {
      fetched: result.data.length,
      has_more: result.has_more,
      limit: result.limit,
      offset: result.offset,
      processing_time_ms: result.processing_time_ms,
      table_state: table_state || {}
    }
  }
}

/**
 * Process table request with server-side filtering, sorting, and pagination
 *
 * @param {Object} params - Parameters
 * @param {Object} [params.table_state] - React-table state object (includes limit/offset)
 * @param {string} [params.requesting_user_public_key] - Requesting user's public key for permissions
 * @returns {Promise<Object>} Processed table data
 */
export async function process_thread_table_request({
  table_state,
  requesting_user_public_key
}) {
  log('Processing thread table request', {
    table_state,
    requesting_user_public_key
  })

  try {
    // Get all threads from filesystem
    const all_threads = await list_threads({
      limit: Infinity,
      offset: 0
    })

    // Apply permission checking and redaction
    const threads_with_permissions = await process_threads_with_permissions(
      all_threads,
      requesting_user_public_key
    )

    // Process with generic table processor
    const result = await process_generic_table_request({
      data: threads_with_permissions,
      table_state,
      extract_metadata: extract_thread_metadata,
      default_sort: DEFAULT_SORT,
      column_types: THREAD_COLUMN_TYPES
    })

    return normalize_table_response(result, table_state)
  } catch (error) {
    log(`Error processing thread table request: ${error.message}`)
    throw error
  }
}

export default process_thread_table_request
