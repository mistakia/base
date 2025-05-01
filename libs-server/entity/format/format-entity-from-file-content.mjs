import debug from 'debug'
import frontMatter from 'front-matter'

const log = debug('entity:format')

/**
 * Parses a markdown file with frontmatter to extract entity properties and content
 *
 * @param {Object} options - Function options
 * @param {string} options.file_content - The raw file content to parse
 * @param {string} options.file_path - The path of the file (for error reporting and metadata)
 * @returns {Object} - Object containing entity_properties and entity_content
 */
export function format_entity_from_file_content({ file_content, file_path }) {
  try {
    log(`Parsing entity content from ${file_path}`)

    if (!file_content) {
      throw new Error('File content is required')
    }

    if (!file_path) {
      throw new Error('File path is required')
    }

    // Extract frontmatter and content using front-matter library
    const { attributes, body } = frontMatter(file_content)

    // Clean invisible characters individually from body
    let cleaned_content = body
    const invisible_chars = [
      '\u200B', // Zero-width space
      '\u200C', // Zero-width non-joiner
      '\u200D', // Zero-width joiner
      '\u200E', // Left-to-right mark
      '\u200F', // Right-to-left mark
      '\uFEFF' // Byte order mark
    ]
    for (const char of invisible_chars) {
      cleaned_content = cleaned_content.replace(new RegExp(`^${char}`, 'g'), '')
    }

    // Ensure content starts with a newline for consistent formatting
    const formatted_content = cleaned_content.startsWith('\n')
      ? cleaned_content
      : '\n' + cleaned_content

    return {
      entity_properties: attributes,
      entity_content: formatted_content.trim()
    }
  } catch (error) {
    log(`Error parsing entity content from ${file_path}:`, error)
    throw error
  }
}
