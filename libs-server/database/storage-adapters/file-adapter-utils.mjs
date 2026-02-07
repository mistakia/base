/**
 * File Adapter Utilities
 *
 * Shared utilities for file-based storage adapters (TSV, Markdown).
 * Contains filter and sort operations for in-memory record processing.
 */

import { parse_filter_expression } from './index.mjs'

/**
 * Check if record matches a filter expression
 *
 * @param {Object} record - Record to check
 * @param {Object} parsed - Parsed filter { field, operator, value }
 * @returns {boolean} Whether record matches
 */
export function match_filter(record, parsed) {
  const { field, operator, value } = parsed
  const record_value = record[field]

  switch (operator) {
    case '=':
      return String(record_value) === value
    case '!=':
      return String(record_value) !== value
    case '>':
      return Number(record_value) > Number(value)
    case '<':
      return Number(record_value) < Number(value)
    case '>=':
      return Number(record_value) >= Number(value)
    case '<=':
      return Number(record_value) <= Number(value)
    case '~':
      return String(record_value).toLowerCase().includes(value.toLowerCase())
    default:
      return true
  }
}

/**
 * Apply filter to records array
 *
 * @param {Array} records - Records to filter
 * @param {Object|string|Array} filter - Filter specification
 * @returns {Array} Filtered records
 */
export function apply_filter(records, filter) {
  if (!filter) {
    return records
  }

  return records.filter((record) => {
    // Handle filter as object with field:value pairs
    if (typeof filter === 'object' && !Array.isArray(filter)) {
      for (const [field, value] of Object.entries(filter)) {
        if (record[field] !== value) {
          return false
        }
      }
      return true
    }

    // Handle filter as string expression
    if (typeof filter === 'string') {
      const parsed = parse_filter_expression(filter)
      return match_filter(record, parsed)
    }

    // Handle filter as array of expressions
    if (Array.isArray(filter)) {
      for (const expr of filter) {
        if (typeof expr === 'string') {
          const parsed = parse_filter_expression(expr)
          if (!match_filter(record, parsed)) {
            return false
          }
        }
      }
      return true
    }

    return true
  })
}

/**
 * Apply sorting to records array
 *
 * @param {Array} records - Records to sort
 * @param {string|Array} sort - Sort specification (prefix with - for descending)
 * @returns {Array} Sorted records (new array)
 */
export function apply_sort(records, sort) {
  if (!sort) {
    return records
  }

  const sorted = [...records]

  if (typeof sort === 'string') {
    const desc = sort.startsWith('-')
    const field = desc ? sort.substring(1) : sort
    sorted.sort((a, b) => {
      const va = a[field] ?? ''
      const vb = b[field] ?? ''
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return desc ? -cmp : cmp
    })
  } else if (Array.isArray(sort)) {
    sorted.sort((a, b) => {
      for (const s of sort) {
        const desc = s.startsWith('-')
        const field = desc ? s.substring(1) : s
        const va = a[field] ?? ''
        const vb = b[field] ?? ''
        const cmp = va < vb ? -1 : va > vb ? 1 : 0
        if (cmp !== 0) {
          return desc ? -cmp : cmp
        }
      }
      return 0
    })
  }

  return sorted
}

export default {
  match_filter,
  apply_filter,
  apply_sort
}
