import debug from 'debug'

const log = debug('markdown:shared:frontmatter')

/**
 * Clean frontmatter data for database storage
 * Ensures values are valid for serialization
 *
 * @param {Object} frontmatter The frontmatter to clean
 * @returns {Object} Cleaned frontmatter
 */
export function clean_frontmatter(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object') {
    return {}
  }

  const cleaned_frontmatter = {}
  Object.keys(frontmatter).forEach((key) => {
    if (frontmatter[key] !== undefined && frontmatter[key] !== null) {
      // Handle arrays specifically for PostgreSQL
      if (Array.isArray(frontmatter[key])) {
        if (frontmatter[key].length > 0) {
          cleaned_frontmatter[key] = frontmatter[key]
        }
      } else {
        cleaned_frontmatter[key] = frontmatter[key]
      }
    }
  })

  return cleaned_frontmatter
}

/**
 * Parse JSON string if possible
 * @param {String} key Field key
 * @param {any} value Field value
 * @returns {any} Parsed value or original
 */
export function parse_json_if_possible(key, value) {
  if (
    typeof value === 'string' &&
    (key === 'fields' ||
      key === 'field_values' ||
      key === 'table_state' ||
      key === 'frontmatter')
  ) {
    try {
      return JSON.parse(value)
    } catch (err) {
      log('Error parsing JSON value for key %s: %o', key, err)
      return value
    }
  }
  return value
}

/**
 * Stringify object values that need serialization for database
 * @param {Object} data Object with values to check for serialization
 * @returns {Object} Object with serialized values where needed
 */
export function stringify_for_database(data) {
  const result = { ...data }

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) {
      result[key] = JSON.stringify(value)
    }
  }

  return result
}

export default {
  clean_frontmatter,
  parse_json_if_possible,
  stringify_for_database
}
