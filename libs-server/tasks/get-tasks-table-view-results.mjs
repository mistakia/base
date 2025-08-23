/**
 * @fileoverview Main handler for task table queries
 * Provides the interface between API endpoints and task table processing
 */

import debug from 'debug'
import { process_task_table_request } from '#libs-server/tasks/process-task-table-request.mjs'

const log = debug('tasks:table:handler')

/**
 * Get task table view results with server-side processing
 *
 * @param {Object} params - Query parameters
 * @param {string} params.user_public_key - User public key for permission filtering
 * @param {Object} [params.table_state] - React-table state object
 * @param {Array} [params.table_state.columns] - Active columns
 * @param {Array} [params.table_state.sort] - Sort configuration
 * @param {Array} [params.table_state.where] - Filter conditions
 * @param {number} [params.table_state.limit] - Page size
 * @param {number} [params.table_state.offset] - Pagination offset
 * @returns {Promise<Object>} Processed table results
 */
export default async function get_tasks_table_view_results({
  user_public_key,
  table_state = {}
}) {
  const start_time = Date.now()

  log('Getting task table view results', {
    user_public_key,
    table_state: {
      columns: table_state.columns?.length || 0,
      sort: table_state.sort?.length || 0,
      where: table_state.where?.length || 0,
      limit: table_state.limit,
      offset: table_state.offset
    }
  })

  try {
    // Validate user_public_key
    if (!user_public_key) {
      throw new Error('user_public_key is required')
    }

    // Validate table_state structure
    if (table_state && typeof table_state !== 'object') {
      throw new Error('table_state must be an object')
    }

    // Process the table request
    const results = await process_task_table_request({
      table_state,
      requesting_user_public_key: user_public_key
    })

    const processing_time = Date.now() - start_time

    // Add metadata for API response
    const response = {
      rows: results.data,
      total_row_count: results.total_count,
      metadata: {
        fetched: results.data.length,
        has_more: results.has_more,
        limit: results.limit,
        offset: results.offset,
        processing_time_ms: processing_time,
        table_state
      }
    }

    log(
      `Task table query completed in ${processing_time}ms: ${results.data.length}/${results.total_count} tasks`
    )

    return response
  } catch (error) {
    const processing_time = Date.now() - start_time
    log(
      `Error getting task table view results after ${processing_time}ms: ${error.message}`
    )

    // Re-throw with additional context
    const enhanced_error = new Error(
      `Task table query failed: ${error.message}`
    )
    enhanced_error.original_error = error
    enhanced_error.processing_time_ms = processing_time
    throw enhanced_error
  }
}
