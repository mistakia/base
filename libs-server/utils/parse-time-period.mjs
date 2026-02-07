/**
 * Parse time period strings into milliseconds or Date objects.
 *
 * Supports periods: h (hours), d (days), w (weeks), m (months)
 * Examples: "24h", "7d", "2w", "1m"
 */

const MILLISECONDS = {
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  m: 30 * 24 * 60 * 60 * 1000
}

// Maximum period limits to prevent integer overflow (10 years max)
const MAX_VALUES = {
  h: 87600, // 10 years in hours
  d: 3650, // 10 years in days
  w: 520, // 10 years in weeks
  m: 120 // 10 years in months
}

const PERIOD_PATTERN = /^(\d+)(h|d|w|m)$/

/**
 * Parse a period string into milliseconds.
 * @param {string} period - Period string (e.g., "24h", "7d", "2w", "1m")
 * @returns {number|null} Milliseconds, or null if invalid
 */
export function parse_time_period_ms(period) {
  if (!period || typeof period !== 'string') {
    return null
  }

  const match = period.toLowerCase().match(PERIOD_PATTERN)
  if (!match) {
    return null
  }

  const [, value, unit] = match
  const num = parseInt(value, 10)

  if (num <= 0 || num > MAX_VALUES[unit]) {
    return null
  }

  return num * MILLISECONDS[unit]
}

/**
 * Parse a period string and return a Date representing the start of the period.
 * @param {string} period - Period string (e.g., "24h", "7d", "2w", "1m")
 * @param {Date} [from] - Reference date (defaults to now)
 * @returns {Date|null} Start date of the period, or null if invalid
 */
export function parse_time_period_date(period, from = new Date()) {
  const ms = parse_time_period_ms(period)
  if (ms === null) {
    return null
  }

  return new Date(from.getTime() - ms)
}

/**
 * Validate a period string.
 * @param {string} period - Period string to validate
 * @returns {boolean} True if valid
 */
export function is_valid_time_period(period) {
  return parse_time_period_ms(period) !== null
}
