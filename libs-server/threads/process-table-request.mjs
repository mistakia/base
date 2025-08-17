/**
 * @fileoverview Server-side table request processing for threads
 */

import debug from 'debug'
import list_threads from './list-threads.mjs'
import { extract_thread_metadata } from './thread-metadata-extractor.mjs'

const log = debug('threads:table')

/**
 * React-table filter operators mapping
 */
const FILTER_OPERATORS = {
  '=': (value, filterValue) => value === filterValue,
  '!=': (value, filterValue) => value !== filterValue,
  '>': (value, filterValue) => Number(value) > Number(filterValue),
  '>=': (value, filterValue) => Number(value) >= Number(filterValue),
  '<': (value, filterValue) => Number(value) < Number(filterValue),
  '<=': (value, filterValue) => Number(value) <= Number(filterValue),
  LIKE: (value, filterValue) =>
    String(value).toLowerCase().includes(String(filterValue).toLowerCase()),
  'NOT LIKE': (value, filterValue) =>
    !String(value).toLowerCase().includes(String(filterValue).toLowerCase()),
  IN: (value, filterValue) =>
    Array.isArray(filterValue) && filterValue.includes(value),
  'NOT IN': (value, filterValue) =>
    Array.isArray(filterValue) && !filterValue.includes(value),
  'IS NULL': (value) => value === null || value === undefined,
  'IS NOT NULL': (value) => value !== null && value !== undefined,
  'IS EMPTY': (value) => value === null || value === undefined || value === '',
  'IS NOT EMPTY': (value) =>
    value !== null && value !== undefined && value !== ''
}

/**
 * Apply filters to thread data based on table state
 */
function apply_filters(threads, where_filters) {
  if (!where_filters || where_filters.length === 0) {
    return threads
  }

  return threads.filter((thread) => {
    return where_filters.every((filter) => {
      const { column_id, operator, value, params = {} } = filter

      // TODO: Handle column_index for duplicate column IDs if needed
      const thread_value = thread[column_id]

      const filter_function = FILTER_OPERATORS[operator]
      if (!filter_function) {
        log(`Unknown filter operator: ${operator}`)
        throw new Error(
          `Invalid operator "${operator}". Must be one of: ${Object.keys(FILTER_OPERATORS).join(', ')}`
        )
      }

      // TODO: Pass params to filter functions if needed for advanced filtering
      return filter_function(thread_value, value, params)
    })
  })
}

/**
 * Apply sorting to thread data based on table state
 */
function apply_sorting(threads, sort_config) {
  if (!sort_config || sort_config.length === 0) {
    // Default sort by created_at descending
    return threads.sort((a, b) => {
      const a_date = new Date(a.created_at || 0)
      const b_date = new Date(b.created_at || 0)
      return b_date - a_date
    })
  }

  return threads.sort((a, b) => {
    for (const sort_item of sort_config) {
      const { column_id, desc } = sort_item

      // Convert desc to boolean to handle undefined/null values
      const is_descending = Boolean(desc)

      // Direct implementation of sort-item.json schema

      // TODO: Handle column_index for duplicate column IDs if needed
      // TODO: Handle multi flag for multi-column sort indication
      const a_value = a[column_id]
      const b_value = b[column_id]

      let comparison = 0

      // Handle null/undefined values
      if (a_value == null && b_value == null) comparison = 0
      else if (a_value == null) comparison = 1
      else if (b_value == null) comparison = -1
      else {
        // Handle different data types
        if (typeof a_value === 'number' && typeof b_value === 'number') {
          comparison = a_value - b_value
        } else if (a_value instanceof Date && b_value instanceof Date) {
          comparison = a_value - b_value
        } else {
          // String comparison
          comparison = String(a_value).localeCompare(String(b_value))
        }
      }

      if (comparison !== 0) {
        return is_descending ? -comparison : comparison
      }
    }
    return 0
  })
}

/**
 * Apply pagination to thread data
 */
function apply_pagination(threads, limit, offset) {
  const total_count = threads.length
  const paginated_threads = threads.slice(offset, offset + limit)

  return {
    data: paginated_threads,
    total_count,
    limit,
    offset
  }
}

/**
 * Process table request with server-side filtering, sorting, and pagination
 *
 * @param {Object} params Parameters
 * @param {Object} [params.table_state] React-table state object (includes limit/offset)
 * @param {string} [params.user_public_key] User public key for filtering
 * @param {string} [params.requesting_user_public_key] Requesting user's public key for permissions
 * @returns {Promise<Object>} Processed table data
 */
export async function process_table_request({
  table_state,
  user_public_key,
  requesting_user_public_key
}) {
  // Extract limit and offset from table_state with defaults
  const limit = table_state?.limit || 1000
  const offset = table_state?.offset || 0

  log('Processing table request', { table_state, user_public_key })

  const start_time = Date.now()

  try {
    // Get all threads using existing list_threads function
    const raw_threads = await list_threads({
      limit: Infinity,
      offset: 0,
      user_public_key,
      requesting_user_public_key
    })

    // Extract and format thread metadata for table display
    const processed_threads = await Promise.all(
      raw_threads.map(async (thread) => {
        return await extract_thread_metadata(thread)
      })
    )

    // Apply table state processing
    let filtered_threads = processed_threads

    // Apply filters
    if (table_state?.where) {
      filtered_threads = apply_filters(filtered_threads, table_state.where)
    }

    // Apply sorting
    if (table_state?.sort) {
      filtered_threads = apply_sorting(filtered_threads, table_state.sort)
    }

    // Apply pagination
    const result = apply_pagination(filtered_threads, limit, offset)

    const processing_time = Date.now() - start_time

    log(
      `Table request processed in ${processing_time}ms, returned ${result.data.length}/${result.total_count} threads`
    )

    return {
      ...result,
      processing_time_ms: processing_time,
      table_state: table_state || {}
    }
  } catch (error) {
    log(`Error processing table request: ${error.message}`)
    throw error
  }
}

export default process_table_request
