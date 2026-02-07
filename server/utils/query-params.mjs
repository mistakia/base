/**
 * Parse array query parameter from request
 * Handles both comma-separated strings and repeated params
 * @param {string|string[]|undefined} param - Query parameter value
 * @returns {string[]} Array of values
 */
export function parse_array_param(param) {
  if (!param) return []
  if (Array.isArray(param)) return param.filter(Boolean)
  return param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
