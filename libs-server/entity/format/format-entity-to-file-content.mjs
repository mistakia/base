import debug from 'debug'

const log = debug('entity:format')

/**
 * Formats entity frontmatter and content into a markdown string
 *
 * @param {Object} options - Function options
 * @param {Object} options.frontmatter - The entity properties to include as frontmatter
 * @param {string} [options.file_content=''] - The markdown content
 * @returns {string} - The formatted markdown content with frontmatter
 */
export function format_entity_to_file_content({
  frontmatter,
  file_content = ''
}) {
  try {
    // Ensure entity_properties is valid
    if (!frontmatter || typeof frontmatter !== 'object') {
      throw new Error('Frontmatter must be a valid object')
    }

    // Create frontmatter block
    const yaml_lines = ['---']

    // Sort keys for consistent output, with 'title', 'type', priority fields first
    const priority_fields = ['title', 'type', 'status', 'description']
    const sorted_keys = Object.keys(frontmatter).sort((a, b) => {
      const a_priority = priority_fields.indexOf(a)
      const b_priority = priority_fields.indexOf(b)

      if (a_priority !== -1 && b_priority !== -1) return a_priority - b_priority
      if (a_priority !== -1) return -1
      if (b_priority !== -1) return 1
      return a.localeCompare(b)
    })

    for (const key of sorted_keys) {
      const value = frontmatter[key]

      // Skip null or undefined values
      if (value === null || value === undefined) {
        continue
      } else if (Array.isArray(value)) {
        yaml_lines.push(`${key}:`)
        value.forEach((item) => {
          yaml_lines.push(
            `  - ${typeof item === 'string' ? JSON.stringify(item) : JSON.stringify(item)}`
          )
        })
      } else if (typeof value === 'object') {
        // Simple one-level object serialization
        yaml_lines.push(`${key}:`)
        Object.entries(value).forEach(([k, v]) => {
          yaml_lines.push(
            `  ${k}: ${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`
          )
        })
      } else if (typeof value === 'string') {
        // For key status values, don't add quotes
        if (key === 'status') {
          yaml_lines.push(`${key}: ${value}`)
        } else {
          // For other strings, ensure proper quoting
          yaml_lines.push(`${key}: ${JSON.stringify(value)}`)
        }
      } else {
        // For non-strings like numbers, booleans
        yaml_lines.push(`${key}: ${value}`)
      }
    }

    yaml_lines.push('---')

    // Combine frontmatter and content
    return `${yaml_lines.join('\n')}\n\n${file_content.trim()}`
  } catch (error) {
    log('Error formatting entity content:', error)
    throw error
  }
}
