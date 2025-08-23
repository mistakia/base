/**
 * @fileoverview Server-side table request processing for threads
 */

import debug from 'debug'
import list_threads from '#libs-server/threads/list-threads.mjs'
import { extract_thread_metadata } from '#libs-server/threads/thread-metadata-extractor.mjs'
import { process_generic_table_request } from '#libs-server/table-processing/process-table-request.mjs'
import { DATA_TYPES } from '#libs-server/table-processing/sorting-utilities.mjs'

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
 * Process table request with server-side filtering, sorting, and pagination
 *
 * @param {Object} params Parameters
 * @param {Object} [params.table_state] React-table state object (includes limit/offset)
 * @param {string} [params.requesting_user_public_key] Requesting user's public key for permissions
 * @returns {Promise<Object>} Processed table data
 */
export async function process_table_request({
  table_state,
  requesting_user_public_key
}) {
  log('Processing thread table request', {
    table_state,
    requesting_user_public_key
  })

  try {
    // Get all threads using existing list_threads function
    const raw_threads = await list_threads({
      limit: Infinity,
      offset: 0,
      requesting_user_public_key
    })

    // Use generic table processing with thread-specific configuration
    return await process_generic_table_request({
      data: raw_threads,
      table_state,
      extract_metadata: extract_thread_metadata,
      default_sort: { column_id: 'created_at', desc: true },
      column_types: THREAD_COLUMN_TYPES
    })
  } catch (error) {
    log(`Error processing thread table request: ${error.message}`)
    throw error
  }
}

export default process_table_request
