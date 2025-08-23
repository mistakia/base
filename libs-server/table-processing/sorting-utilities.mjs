/**
 * @fileoverview Sorting utilities for table processing
 * Provides reusable sorting functions with type awareness
 */

import { TABLE_DATA_TYPES } from 'react-table/src/constants.mjs'

/**
 * Data type constants for type-aware sorting
 */
export const DATA_TYPES = {
  NUMBER: TABLE_DATA_TYPES.NUMBER,
  DATE: TABLE_DATA_TYPES.DATE,
  TEXT: TABLE_DATA_TYPES.TEXT,
  BOOLEAN: TABLE_DATA_TYPES.BOOLEAN
}

/**
 * Compare two values for sorting with type awareness
 * @param {Object} params - Parameters object
 * @param {*} params.a_value - First value
 * @param {*} params.b_value - Second value
 * @param {string} [params.data_type] - Data type hint for comparison
 * @returns {number} Comparison result (-1, 0, 1)
 */
export function compare_values({ a_value, b_value, data_type = null }) {
  // Handle null/undefined values
  if (a_value == null && b_value == null) return 0
  else if (a_value == null) return 1
  else if (b_value == null) return -1

  // Use data type hint if provided
  if (data_type) {
    switch (data_type) {
      case DATA_TYPES.NUMBER:
        return Number(a_value) - Number(b_value)
      case DATA_TYPES.DATE:
        return new Date(a_value) - new Date(b_value)
      case DATA_TYPES.BOOLEAN:
        return Boolean(a_value) - Boolean(b_value)
      case DATA_TYPES.TEXT:
        return String(a_value).localeCompare(String(b_value))
    }
  }

  // Auto-detect data types
  if (typeof a_value === 'number' && typeof b_value === 'number') {
    return a_value - b_value
  } else if (a_value instanceof Date && b_value instanceof Date) {
    return a_value - b_value
  } else if (typeof a_value === 'boolean' && typeof b_value === 'boolean') {
    return a_value - b_value
  } else {
    // String comparison as fallback
    return String(a_value).localeCompare(String(b_value))
  }
}

/**
 * Create a sorting function for a specific column
 * @param {Object} params - Parameters object
 * @param {string} params.column_id - Column identifier
 * @param {boolean} [params.desc] - Whether to sort descending
 * @param {Function} [params.get_value] - Function to extract value from data object
 * @param {string} [params.data_type] - Data type hint for comparison
 * @returns {Function} Sorting function
 */
export function create_column_sorter({
  column_id,
  desc = false,
  get_value = (item, column_id) => item[column_id],
  data_type = null
}) {
  return (a, b) => {
    const a_value = get_value(a, column_id)
    const b_value = get_value(b, column_id)

    const comparison = compare_values({ a_value, b_value, data_type })
    return desc ? -comparison : comparison
  }
}

/**
 * Create a multi-column sorting function
 * @param {Object} params - Parameters object
 * @param {Array} params.sort_config - Array of sort configurations
 * @param {Function} [params.get_value] - Function to extract value from data object
 * @param {Object} [params.column_types] - Map of column_id to data_type
 * @returns {Function} Multi-column sorting function
 */
export function create_multi_column_sorter({
  sort_config,
  get_value = (item, column_id) => item[column_id],
  column_types = {}
}) {
  return (a, b) => {
    for (const sort_item of sort_config) {
      const { column_id, desc } = sort_item
      const is_descending = Boolean(desc)

      const a_value = get_value(a, column_id)
      const b_value = get_value(b, column_id)
      const data_type = column_types[column_id]

      const comparison = compare_values({ a_value, b_value, data_type })

      if (comparison !== 0) {
        return is_descending ? -comparison : comparison
      }
    }
    return 0
  }
}

/**
 * Sort data with optional default sort configuration
 * @param {Object} params - Parameters object
 * @param {Array} params.data - Data to sort
 * @param {Array} [params.sort_config] - Sort configuration
 * @param {Object} [params.default_sort] - Default sort if no config provided
 * @param {Function} [params.get_value] - Function to extract value from data object
 * @param {Object} [params.column_types] - Map of column_id to data_type
 * @returns {Array} Sorted data
 */
export function sort_data({
  data,
  sort_config = null,
  default_sort = null,
  get_value = (item, column_id) => item[column_id],
  column_types = {}
}) {
  if (!sort_config || sort_config.length === 0) {
    // Apply default sort if provided
    if (default_sort) {
      const { column_id, desc = true } = default_sort
      const data_type = column_types[column_id]
      const sorter = create_column_sorter({
        column_id,
        desc,
        get_value,
        data_type
      })
      return [...data].sort(sorter)
    }
    return data
  }

  const sorter = create_multi_column_sorter({
    sort_config,
    get_value,
    column_types
  })

  return [...data].sort(sorter)
}

export default {
  DATA_TYPES,
  compare_values,
  create_column_sorter,
  create_multi_column_sorter,
  sort_data
}
