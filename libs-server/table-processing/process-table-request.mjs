/**
 * @fileoverview Common server-side table request processing utilities
 * Provides reusable filtering, sorting, and pagination logic for all entity tables
 */

import debug from 'debug'
import {
  FILTER_OPERATORS,
  get_operator_names
} from '#libs-server/table-processing/filter-operators.mjs'
import { sort_data } from '#libs-server/table-processing/sorting-utilities.mjs'

const log = debug('table-processing')

/**
 * Apply filters to data based on table state
 * @param {Object} params - Parameters object
 * @param {Array} params.data - Array of data objects to filter
 * @param {Array} params.where_filters - Array of filter configurations
 * @param {Function} [params.get_value] - Optional function to extract value from data object
 * @returns {Array} Filtered data
 */
export function apply_filters({
  data,
  where_filters,
  get_value = (item, column_id) => item[column_id]
}) {
  if (!where_filters || where_filters.length === 0) {
    return data
  }

  return data.filter((item) => {
    return where_filters.every((filter) => {
      const { column_id, operator, value, params = {} } = filter

      // Use custom getter if provided, otherwise direct property access
      const item_value = get_value(item, column_id)

      const filter_function = FILTER_OPERATORS[operator]
      if (!filter_function) {
        log(`Unknown filter operator: ${operator}`)
        throw new Error(
          `Invalid operator "${operator}". Must be one of: ${get_operator_names().join(', ')}`
        )
      }

      // Pass params to filter functions if needed for advanced filtering
      return filter_function(item_value, value, params)
    })
  })
}

/**
 * Apply sorting to data based on table state
 * @param {Object} params - Parameters object
 * @param {Array} params.data - Array of data objects to sort
 * @param {Array} params.sort_config - Array of sort configurations
 * @param {Function} [params.get_value] - Optional function to extract value from data object
 * @param {Object} [params.default_sort] - Default sort configuration if none provided
 * @param {Object} [params.column_types] - Map of column_id to data_type for type-aware sorting
 * @returns {Array} Sorted data
 */
export function apply_sorting({
  data,
  sort_config,
  get_value = (item, column_id) => item[column_id],
  default_sort = null,
  column_types = {}
}) {
  return sort_data({
    data,
    sort_config,
    default_sort,
    get_value,
    column_types
  })
}

/**
 * Apply pagination to data
 * @param {Object} params - Parameters object
 * @param {Array} params.data - Array of data to paginate
 * @param {number} params.limit - Number of items per page
 * @param {number} params.offset - Starting position
 * @returns {Object} Paginated result with metadata
 */
export function apply_pagination({ data, limit, offset }) {
  const total_count = data.length
  const paginated_data = data.slice(offset, offset + limit)

  return {
    data: paginated_data,
    total_count,
    limit,
    offset,
    has_more: offset + limit < total_count
  }
}

/**
 * Process a generic table request with server-side filtering, sorting, and pagination
 * @param {Object} params - Processing parameters
 * @param {Array} params.data - Raw data to process
 * @param {Object} params.table_state - React-table state object
 * @param {Function} [params.extract_metadata] - Optional function to extract metadata from items
 * @param {Function} [params.get_value] - Optional function to extract values for filtering/sorting
 * @param {Object} [params.default_sort] - Default sort configuration
 * @param {Object} [params.column_types] - Map of column_id to data_type for type-aware sorting
 * @returns {Promise<Object>} Processed table data
 */
export async function process_generic_table_request({
  data,
  table_state,
  extract_metadata = (item) => item,
  get_value = (item, column_id) => item[column_id],
  default_sort = null,
  column_types = {}
}) {
  // Extract limit and offset from table_state with defaults
  const limit = table_state?.limit || 1000
  const offset = table_state?.offset || 0

  log('Processing table request', { table_state, item_count: data.length })

  const start_time = Date.now()

  try {
    // Extract and format metadata for table display
    const processed_data = await Promise.all(
      data.map(async (item) => {
        return await extract_metadata(item)
      })
    )

    // Apply table state processing
    let filtered_data = processed_data

    // Apply filters
    if (table_state?.where) {
      filtered_data = apply_filters({
        data: filtered_data,
        where_filters: table_state.where,
        get_value
      })
    }

    // Apply sorting
    filtered_data = apply_sorting({
      data: filtered_data,
      sort_config: table_state?.sort,
      get_value,
      default_sort,
      column_types
    })

    // Apply pagination
    const result = apply_pagination({
      data: filtered_data,
      limit,
      offset
    })

    const processing_time = Date.now() - start_time

    log(
      `Table request processed in ${processing_time}ms, returned ${result.data.length}/${result.total_count} items`
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

export default process_generic_table_request
