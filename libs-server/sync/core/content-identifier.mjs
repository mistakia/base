import debug from 'debug'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as json from 'multiformats/codecs/json'

const log = debug('sync:core:content-identifier')

/**
 * Create a CID (Content Identifier) for data object
 * Uses SHA-256 hash and JSON codec
 *
 * @param {Object} data_object - Data to create CID for
 * @returns {string} CID string
 */
export async function create_content_identifier(data_object) {
  const bytes = json.encode(data_object)
  const hash = await sha256.digest(bytes)
  const content_id = CID.create(1, json.code, hash)
  log(`Created content identifier for object: ${content_id}`)
  return content_id.toString()
}

/**
 * Format value for consistent comparison
 *
 * @param {any} value - Value to format
 * @returns {string} Formatted value
 */
export function format_value_for_comparison(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/**
 * Detect changes between two data objects
 *
 * @param {Object} options - Function options
 * @param {Object} options.current_data - Current data object
 * @param {Object} options.previous_data - Previous data object
 * @returns {Object|null} Changes object or null if no changes
 */
export function detect_field_changes({ current_data, previous_data }) {
  if (!previous_data) return null

  const detected_changes = {}

  // Compare all fields directly
  const all_fields = new Set([
    ...Object.keys(current_data),
    ...Object.keys(previous_data)
  ])

  for (const field of all_fields) {
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
