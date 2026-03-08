/**
 * Parse an interval string (e.g., '30s', '5m', '1h', '1d') to milliseconds
 *
 * @param {string} interval_str - Interval string with unit suffix
 * @returns {number|null} Milliseconds or null if invalid
 */
export const parse_interval_ms = (interval_str) => {
  const match = interval_str?.match(/^(\d+)(s|m|h|d)$/)
  if (!match) {
    return null
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 }
  return value * multipliers[unit]
}
