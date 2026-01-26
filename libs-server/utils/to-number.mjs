/**
 * @fileoverview Utility for safely converting values to Number
 *
 * Handles BigInt values from DuckDB which cannot be JSON serialized
 * and must be converted to Number for API responses.
 */

/**
 * Convert value to Number, handling BigInt from DuckDB
 *
 * BigInt values cannot be JSON serialized, so they must be converted.
 * Warns if the value exceeds Number.MAX_SAFE_INTEGER (precision loss).
 *
 * @param {*} value - Value to convert
 * @returns {number} Numeric value (0 if null/undefined)
 */
export function to_number(value) {
  if (typeof value === 'bigint') {
    if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
      console.warn(
        `BigInt value ${value} exceeds safe integer range, precision loss may occur`
      )
    }
    return Number(value)
  }
  // Use nullish coalescing to preserve explicit zeros
  return value ?? 0
}
