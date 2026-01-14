/**
 * Utility functions for safely handling tool result values.
 *
 * Tool results can be any type (object, array, string, number, boolean, null)
 * per the thread timeline schema. These utilities ensure consistent type handling
 * across tool components.
 */

/**
 * Safely convert a tool result to a string.
 *
 * @param {*} result - The result value from tool_result_event.content.result
 * @param {Object} options - Configuration options
 * @param {string} options.fallback - Value to return for null/undefined (default: '')
 * @param {boolean} options.stringify_objects - JSON.stringify objects/arrays (default: true)
 * @returns {string} The result as a string
 */
export const ensure_string_result = (
  result,
  { fallback = '', stringify_objects = true } = {}
) => {
  if (typeof result === 'string') return result
  if (result === null || result === undefined) return fallback
  if (stringify_objects && typeof result === 'object') {
    return JSON.stringify(result, null, 2)
  }
  return String(result)
}

/**
 * Check if a tool result is a valid string for text processing.
 *
 * @param {*} result - The result value to check
 * @returns {boolean} True if result is a string
 */
export const is_string_result = (result) => {
  return typeof result === 'string'
}

/**
 * Get the line count from a tool result, safely handling non-string values.
 *
 * @param {*} result - The result value from tool_result_event.content.result
 * @returns {number} Number of lines, or 0 if not a string
 */
export const get_line_count = (result) => {
  if (typeof result !== 'string') return 0
  return result.split('\n').length
}
