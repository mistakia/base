import debug from 'debug'
import frontMatter from 'front-matter'
import MarkdownIt from 'markdown-it'

const log = debug('markdown:format')
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})

/**
 * Parses a markdown file with frontmatter to extract document properties and content
 *
 * @param {Object} options - Function options
 * @param {string} options.file_content - The raw file content to parse
 * @param {string} options.file_path - The path of the file for error reporting
 * @returns {Object} - Object containing document_properties, document_content, and parsed tokens
 */
export function format_document_from_file_content({ file_content, file_path }) {
  try {
    log(`Parsing document content from ${file_path}`)

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

    const document_properties = attributes

    // Clean up trailing newlines in string properties (legacy block scalars)
    for (const key in document_properties) {
      if (
        typeof document_properties[key] === 'string' &&
        document_properties[key].endsWith('\n')
      ) {
        document_properties[key] = document_properties[key].replace(/\n$/, '')
      }
    }

    const document_content = formatted_content.trim()

    // Parse markdown content into tokens for reliable processing
    const tokens = md.parse(document_content, {})

    // Ensure parent references are set up correctly
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].children) {
        for (let j = 0; j < tokens[i].children.length; j++) {
          tokens[i].children[j].parent = tokens[i]
        }
      }
    }

    return {
      document_properties,
      document_content,
      tokens
    }
  } catch (error) {
    log(`Error parsing document content from ${file_path}:`, error)
    throw error
  }
}
