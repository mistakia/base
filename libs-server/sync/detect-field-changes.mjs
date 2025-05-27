/**
 * Format value for consistent comparison
 *
 * @param {any} value - Value to format
 * @returns {string} Formatted value
 */
function format_value_for_comparison(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/**
 * Detect changes between two data objects
 *
 * @param {Object} options - Function options
 * @param {Object} options.current_data - Current data object
 * @param {Object} options.previous_data - Previous data object
 * @param {boolean} [options.compare_only_previous_fields=false] - If true, only compare fields present in previous_data
 * @param {Array<string>} [options.ignore_fields=[]] - Fields to ignore during comparison
 * @returns {Object|null} Changes object or null if no changes
 */
export function detect_field_changes({
  current_data,
  previous_data,
  compare_only_previous_fields = false,
  ignore_fields = []
}) {
  if (!previous_data) return null

  const detected_changes = {}

  // Determine which fields to compare
  let fields_to_compare
  if (compare_only_previous_fields) {
    fields_to_compare = Object.keys(previous_data)
  } else {
    fields_to_compare = Array.from(
      new Set([...Object.keys(current_data), ...Object.keys(previous_data)])
    )
  }

  // Remove ignored fields
  fields_to_compare = fields_to_compare.filter(
    (field) => !ignore_fields.includes(field)
  )

  for (const field of fields_to_compare) {
    const current_value = current_data[field]
    const previous_value = previous_data[field]

    if (
      format_value_for_comparison(current_value) !==
      format_value_for_comparison(previous_value)
    ) {
      detected_changes[field] = {
        from: previous_value,
        to: current_value,
        changed: true
      }
    }
  }

  return Object.keys(detected_changes).length > 0 ? detected_changes : null
}
