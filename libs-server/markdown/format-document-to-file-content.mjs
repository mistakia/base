import debug from 'debug'

const log = debug('markdown:format-document-to-file-content')

/**
 * Format document properties and content into a markdown file with frontmatter
 *
 * @param {Object} options - Function options
 * @param {Object} options.document_properties - The document properties to include in frontmatter
 * @param {string} [options.document_content=''] - The markdown content to include after the frontmatter
 * @returns {string} - The formatted markdown file content
 */
export function format_document_to_file_content({
  document_properties,
  document_content = ''
}) {
  try {
    if (!document_properties || typeof document_properties !== 'object') {
      throw new Error('Document properties must be a valid object')
    }

    // Create frontmatter block
    const yaml_lines = ['---']

    // Sort keys for consistent output, with priority fields first
    const priority_fields = ['title', 'type', 'status', 'description']
    const sorted_keys = Object.keys(document_properties).sort((a, b) => {
      const a_priority = priority_fields.indexOf(a)
      const b_priority = priority_fields.indexOf(b)

      if (a_priority !== -1 && b_priority !== -1) return a_priority - b_priority
      if (a_priority !== -1) return -1
      if (b_priority !== -1) return 1
      return a.localeCompare(b)
    })

    // Helper function to stringify with single quotes
    const stringify_with_single_quotes = (value) => {
      if (typeof value === 'string') {
        // Replace double quotes with single quotes from JSON.stringify output
        return JSON.stringify(value).replace(/^"(.*)"$/, "'$1'")
      }
      return JSON.stringify(value)
    }

    for (const key of sorted_keys) {
      const value = document_properties[key]

      // Skip null or undefined values
      if (value === null || value === undefined) {
        continue
      } else if (Array.isArray(value)) {
        yaml_lines.push(`${key}:`)
        value.forEach((item) => {
          yaml_lines.push(
            `  - ${typeof item === 'string' ? stringify_with_single_quotes(item) : stringify_with_single_quotes(item)}`
          )
        })
      } else if (typeof value === 'object') {
        // Simple one-level object serialization
        yaml_lines.push(`${key}:`)
        Object.entries(value).forEach(([k, v]) => {
          yaml_lines.push(
            `  ${k}: ${typeof v === 'string' ? stringify_with_single_quotes(v) : stringify_with_single_quotes(v)}`
          )
        })
      } else if (typeof value === 'string') {
        // For key status values, don't add quotes
        if (key === 'status') {
          yaml_lines.push(`${key}: ${value}`)
        } else {
          // For other strings, ensure proper quoting
          yaml_lines.push(`${key}: ${stringify_with_single_quotes(value)}`)
        }
      } else {
        // For non-strings like numbers, booleans
        yaml_lines.push(`${key}: ${value}`)
      }
    }

    yaml_lines.push('---')

    // Combine frontmatter and content
    return `${yaml_lines.join('\n')}\n\n${document_content.trim()}`
  } catch (error) {
    log('Error formatting document content:', error)
    throw error
  }
}
