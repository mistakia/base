/**
 * @fileoverview Server-side table request processing for threads
 */

import debug from 'debug'

import list_threads from '#libs-server/threads/list-threads.mjs'
import { extract_thread_metadata } from '#libs-server/threads/thread-metadata-extractor.mjs'
import { process_generic_table_request } from '#libs-server/table-processing/process-table-request.mjs'
import { DATA_TYPES } from '#libs-server/table-processing/sorting-utilities.mjs'
import { check_thread_permission_for_user } from '#server/middleware/permission/index.mjs'
import { redact_thread_data } from '#server/middleware/content-redactor.mjs'

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
 * Default sorting configuration for thread tables
 */
const DEFAULT_SORT = {
  column_id: 'created_at',
  desc: true
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
      try {
        const result = await check_thread_permission_for_user({
          user_public_key: requesting_user_public_key,
          thread_id: thread.thread_id
        })
        return result.allowed ? thread : redact_thread_data(thread)
      } catch (error) {
        log(
          `Error checking permission for thread ${thread.thread_id}: ${error.message}`
        )
        return redact_thread_data(thread)
      }
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
