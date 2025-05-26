import debug from 'debug'

const log = debug('markdown:format-document-to-file-content')

// Helper function to stringify with single quotes
const stringify_with_single_quotes = (value) => {
  if (typeof value === 'string') {
    // Replace double quotes with single quotes from JSON.stringify output
    return JSON.stringify(value).replace(/^"(.*)"$/, "'$1'")
  }
  return JSON.stringify(value)
}

/**
 * Determines if a string contains newlines or other characters that would need special YAML formatting
 *
 * @param {string} str - The string to check
 * @param {string} key - The key associated with the string
 * @returns {boolean} - Whether the string needs block scalar formatting
 */
const needs_block_format = (str, key) => {
  // Always use block scalar for description
  if (key === 'description') return true
  // Use block scalar for multiline strings, single quote, or long strings
  return (
    str.includes('\n') ||
    str.includes('\r') ||
    str.includes("'") ||
    str.includes('"') ||
    str.includes('\\') ||
    str.length > 80
  )
}

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
        } else if (needs_block_format(value, key)) {
          // Use YAML block scalar for multiline strings or for specific fields
          yaml_lines.push(`${key}: |`)
          // Split by line, trim trailing whitespace, and indent with 2 spaces
          const lines = value
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
          lines.forEach((line) => {
            yaml_lines.push(`  ${line.replace(/\s+$/, '')}`)
          })
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
    return `${yaml_lines.join('\n')}\n\n${document_content.trim()}\n`
  } catch (error) {
    log('Error formatting document content:', error)
    throw error
  }
}
