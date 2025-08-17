/**
 * @fileoverview Client-side percentile calculations for thread table cell styling
 */

/**
 * Calculate percentiles for numeric values in an array
 * @param {Array} values - Array of numeric values
 * @param {Array} percentiles - Array of percentile thresholds (e.g., [25, 50, 75, 90])
 * @returns {Object} Map of percentile thresholds to values
 */
function calculate_percentiles(values, percentiles = [25, 50, 75, 90]) {
  if (!Array.isArray(values) || values.length === 0) {
    return {}
  }

  // Filter out null/undefined/NaN values and sort
  const sorted_values = values
    .filter((value) => typeof value === 'number' && !isNaN(value))
    .sort((a, b) => a - b)

  if (sorted_values.length === 0) {
    return {}
  }

  const result = {}

  percentiles.forEach((percentile) => {
    if (percentile < 0 || percentile > 100) return

    const index = (percentile / 100) * (sorted_values.length - 1)

    if (index === Math.floor(index)) {
      // Exact index
      result[percentile] = sorted_values[index]
    } else {
      // Interpolate between two values
      const lower_index = Math.floor(index)
      const upper_index = Math.ceil(index)
      const weight = index - lower_index

      result[percentile] =
        sorted_values[lower_index] * (1 - weight) +
        sorted_values[upper_index] * weight
    }
  })

  return result
}

/**
 * Get percentile rank for a value within a dataset
 * @param {number} value - The value to rank
 * @param {Array} values - Array of all values for comparison
 * @returns {number} Percentile rank (0-100)
 */
function get_percentile_rank(value, values) {
  if (typeof value !== 'number' || isNaN(value) || !Array.isArray(values)) {
    return 0
  }

  const sorted_values = values
    .filter((v) => typeof v === 'number' && !isNaN(v))
    .sort((a, b) => a - b)

  if (sorted_values.length === 0) {
    return 0
  }

  // Count values less than the target value
  let count_below = 0
  let count_equal = 0

  for (const v of sorted_values) {
    if (v < value) {
      count_below++
    } else if (v === value) {
      count_equal++
    }
  }

  // Use the midpoint method for percentile rank
  const rank = ((count_below + count_equal / 2) / sorted_values.length) * 100

  return Math.round(rank)
}

/**
 * Calculate percentiles for all numeric columns in thread data
 * @param {Array} threads - Array of thread objects
 * @returns {Object} Percentiles for each numeric column
 */
export function calculate_thread_percentiles(threads) {
  if (!Array.isArray(threads) || threads.length === 0) {
    return {}
  }

  const numeric_columns = [
    'duration_minutes',
    'message_count',
    'user_message_count',
    'assistant_message_count',
    'tool_call_count',
    'token_count',
    'total_cost'
  ]

  const column_percentiles = {}

  numeric_columns.forEach((column) => {
    const values = threads.map((thread) => thread[column])
    column_percentiles[column] = calculate_percentiles(values)
  })

  return column_percentiles
}

/**
 * Get cell styling based on percentile rank
 * @param {number} value - The cell value
 * @param {Array} all_values - All values for the column
 * @param {Object} options - Styling options
 * @returns {Object} CSS style object
 */
export function get_percentile_cell_style(value, all_values, options = {}) {
  const {
    color_scale = 'blue', // 'blue', 'green', 'red', 'orange'
    show_background = true,
    min_opacity = 0.1,
    max_opacity = 0.6
  } = options

  const percentile_rank = get_percentile_rank(value, all_values)

  if (!show_background || percentile_rank === 0) {
    return {}
  }

  // Map percentile rank to opacity
  const opacity =
    min_opacity + (percentile_rank / 100) * (max_opacity - min_opacity)

  // Color scale mapping
  const color_map = {
    blue: `rgba(33, 150, 243, ${opacity})`,
    green: `rgba(76, 175, 80, ${opacity})`,
    red: `rgba(244, 67, 54, ${opacity})`,
    orange: `rgba(255, 152, 0, ${opacity})`,
    purple: `rgba(156, 39, 176, ${opacity})`
  }

  return {
    backgroundColor: color_map[color_scale] || color_map.blue
  }
}

/**
 * Get enhanced thread data with percentile information
 * @param {Array} threads - Array of thread objects
 * @returns {Array} Threads with percentile data added
 */
export function enhance_threads_with_percentiles(threads) {
  if (!Array.isArray(threads) || threads.length === 0) {
    return []
  }

  const percentiles = calculate_thread_percentiles(threads)

  return threads.map((thread) => {
    const percentile_data = {}

    Object.keys(percentiles).forEach((column) => {
      const value = thread[column]
      if (typeof value === 'number' && !isNaN(value)) {
        const all_values = threads.map((t) => t[column])
        percentile_data[`${column}_percentile_rank`] = get_percentile_rank(
          value,
          all_values
        )
        percentile_data[`${column}_percentile_style`] =
          get_percentile_cell_style(value, all_values)
      }
    })

    return {
      ...thread,
      percentile_data
    }
  })
}

export default {
  calculate_percentiles,
  calculate_thread_percentiles,
  get_percentile_rank,
  get_percentile_cell_style,
  enhance_threads_with_percentiles
}
