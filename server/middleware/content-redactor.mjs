import path from 'path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { visit } from 'unist-util-visit'

// Redaction character
const REDACT_CHAR = '█'

/**
 * Redacts text content with replacement characters matching original length
 *
 * @param {string} content - Text content to redact
 * @param {string} replacement_char - Character to use for redaction (default: █)
 * @returns {string} Redacted text of same length
 */
export const redact_text_content = (
  content,
  replacement_char = REDACT_CHAR
) => {
  if (!content || typeof content !== 'string') {
    return content
  }

  // Preserve line breaks and spacing structure
  return content
    .split('\n')
    .map((line) => {
      // Replace non-whitespace characters with redaction character
      return line.replace(/\S/g, replacement_char)
    })
    .join('\n')
}

/**
 * Redacts a filename while preserving extension and directory indicators
 *
 * @param {string} filename - Filename to redact
 * @returns {string} Redacted filename with preserved extension
 */
export const redact_filename_preserving_extension = (filename) => {
  if (!filename || typeof filename !== 'string') {
    return filename
  }

  const extension = path.extname(filename)
  const basename = path.basename(filename, extension)

  // Redact basename but preserve extension for structure
  const redacted_basename = basename.replace(/\S/g, REDACT_CHAR)

  return redacted_basename + extension
}

/**
 * Redacts a file object for directory listings
 *
 * @param {Object} file_info - File information object
 * @returns {Object} Redacted file information
 */
export const redact_file_info = ({ file_info }) => {
  const redacted = { ...file_info }

  // Use single _redacted flag for simplicity
  redacted.is_redacted = true

  if (redacted.name) {
    redacted.name = redact_filename_preserving_extension(redacted.name)
  }

  // Preserve structural information
  // Keep: type (file/directory), has_frontmatter, entity_type
  // Redact: potentially sensitive metadata
  if (redacted.modified) {
    redacted.modified = '████-██-██T██:██:██.███Z'
  }

  if (redacted.size !== null && redacted.size !== undefined) {
    // Redact size but indicate magnitude
    const magnitude = Math.floor(Math.log10(redacted.size + 1))
    redacted.size = parseInt('9'.repeat(magnitude + 1))
  }

  return redacted
}

/**
 * Redacts file content response
 *
 * @param {Object} file_response - File content response object
 * @returns {Object} Redacted file response
 */
export const redact_file_content_response = (file_response) => {
  const redacted = { ...file_response }

  // Use single _redacted flag
  redacted.is_redacted = true

  // Determine file extension for markdown detection
  const file_extension = redacted.path ? path.extname(redacted.path) : ''

  // Redact the main content with markdown awareness
  if (redacted.content) {
    if (is_markdown_content(file_extension)) {
      redacted.content = redact_markdown_content(redacted.content)
    } else {
      redacted.content = redact_text_content(redacted.content)
    }
  }

  // Redact markdown body with markdown awareness
  if (redacted.markdown) {
    redacted.markdown = redact_markdown_content(redacted.markdown)
  }

  // Redact frontmatter values but preserve keys for structure
  if (redacted.frontmatter && typeof redacted.frontmatter === 'object') {
    redacted.frontmatter = redact_object_values(redacted.frontmatter)
  }

  // Redact path if sensitive
  if (redacted.path) {
    redacted.path = redact_path_components(redacted.path)
  }

  // Keep response shape identical to non-redacted responses
  return redacted
}

/**
 * Redacts object values while preserving keys
 *
 * @param {Object} obj - Object to redact values from
 * @returns {Object} Object with redacted values
 */
export const redact_object_values = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj
  }

  const redacted = {}

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      redacted[key] = value
    } else if (typeof value === 'string') {
      redacted[key] = redact_text_content(value)
    } else if (typeof value === 'number') {
      redacted[key] = 9999
    } else if (typeof value === 'boolean') {
      redacted[key] = false
    } else if (Array.isArray(value)) {
      redacted[key] = value.map((item) =>
        typeof item === 'object'
          ? redact_object_values(item)
          : redact_text_content(String(item))
      )
    } else if (typeof value === 'object') {
      redacted[key] = redact_object_values(value)
    } else {
      redacted[key] = '████████'
    }
  }

  return redacted
}

/**
 * Redacts path components while preserving structure
 *
 * @param {string} filepath - Path to redact
 * @returns {string} Redacted path
 */
export const redact_path_components = (filepath) => {
  if (!filepath || typeof filepath !== 'string') {
    return filepath
  }

  const parts = filepath.split('/')
  return parts
    .map((part, index) => {
      // Keep root slash and basic structure
      if (part === '' && index === 0) return ''
      if (part === '.' || part === '..') return part

      // Redact path component but preserve extension
      return redact_filename_preserving_extension(part)
    })
    .join('/')
}

/**
 * Redacts thread data while preserving structure
 *
 * @param {Object} thread - Thread object to redact
 * @returns {Object} Redacted thread object
 */
export const redact_thread_data = (thread) => {
  if (!thread) return thread

  const redacted = { ...thread }

  // Mark as redacted
  redacted.is_redacted = true

  // Redact thread content
  if (redacted.thread_main_request) {
    redacted.thread_main_request = redact_text_content(
      redacted.thread_main_request
    )
  }

  // Redact timeline entries
  if (redacted.timeline && Array.isArray(redacted.timeline)) {
    redacted.timeline = redacted.timeline.map((entry) => {
      const redacted_entry = { ...entry }

      // Redact message content
      if (redacted_entry.content) {
        redacted_entry.content = redact_text_content(redacted_entry.content)
      }

      // Redact tool parameters
      if (redacted_entry.parameters) {
        redacted_entry.parameters = redact_object_values(
          redacted_entry.parameters
        )
      }

      // Redact error messages
      if (redacted_entry.message) {
        redacted_entry.message = redact_text_content(redacted_entry.message)
      }

      return redacted_entry
    })
  }

  // Keep response shape identical to non-redacted responses
  return redacted
}
/**
 * Redacts URL while preserving basic structure
 *
 * @param {string} url - URL to redact
 * @returns {string} Redacted URL
 */
export const redact_url = (url) => {
  if (!url || typeof url !== 'string') {
    return url
  }

  try {
    const urlObj = new URL(url)
    // Preserve protocol and basic structure
    return `${urlObj.protocol}//${REDACT_CHAR.repeat(8)}.${REDACT_CHAR.repeat(3)}`
  } catch {
    // If not a valid URL, redact as text
    return redact_text_content(url)
  }
}

/**
 * Redacts code content while preserving indentation and structure
 *
 * @param {string} code - Code content to redact
 * @returns {string} Redacted code
 */
export const redact_code_content = (code) => {
  if (!code || typeof code !== 'string') {
    return code
  }

  return code
    .split('\n')
    .map((line) => {
      // Preserve leading whitespace for indentation
      const leadingWhitespace = line.match(/^\s*/)[0]
      const content = line.slice(leadingWhitespace.length)

      if (content.length === 0) {
        return line // Empty line, keep as-is
      }

      // Redact non-whitespace but preserve line structure
      const redactedContent = content.replace(/\S/g, REDACT_CHAR)
      return leadingWhitespace + redactedContent
    })
    .join('\n')
}

/**
 * Redacts markdown content while preserving structure and formatting
 *
 * @param {string} markdown_content - Markdown content to redact
 * @param {Object} options - Redaction options
 * @param {boolean} options.preserve_structure - Whether to preserve markdown structure (default: true)
 * @returns {string} Redacted markdown content
 */
export const redact_markdown_content = (markdown_content, options = {}) => {
  if (!markdown_content || typeof markdown_content !== 'string') {
    return markdown_content
  }

  const { preserve_structure = true } = options

  // If not preserving structure, fall back to simple text redaction
  if (!preserve_structure) {
    return redact_text_content(markdown_content)
  }

  try {
    // Parse markdown into AST
    const ast = unified().use(remarkParse).parse(markdown_content)

    // Visit all nodes and redact content while preserving structure
    visit(ast, (node) => {
      switch (node.type) {
        case 'text':
          // Redact text content
          node.value = redact_text_content(node.value)
          break
        case 'code':
          // Redact code block content but preserve structure
          node.value = redact_code_content(node.value)
          break
        case 'inlineCode':
          // Redact inline code
          node.value = redact_text_content(node.value)
          break
        case 'link':
          // Redact URL but preserve link structure
          if (node.url) {
            node.url = redact_url(node.url)
          }
          if (node.title) {
            node.title = redact_text_content(node.title)
          }
          break
        case 'image':
          // Redact image URLs and alt text
          if (node.url) {
            node.url = redact_url(node.url)
          }
          if (node.alt) {
            node.alt = redact_text_content(node.alt)
          }
          if (node.title) {
            node.title = redact_text_content(node.title)
          }
          break
        case 'html':
          // Redact HTML content
          node.value = redact_text_content(node.value)
          break
        case 'yaml':
          // Redact YAML frontmatter
          node.value = redact_text_content(node.value)
          break
        case 'definition':
          // Redact link definitions
          if (node.url) {
            node.url = redact_url(node.url)
          }
          if (node.title) {
            node.title = redact_text_content(node.title)
          }
          break
      }
    })

    // Convert AST back to markdown
    return unified().use(remarkStringify).stringify(ast)
  } catch (error) {
    // If parsing fails, fall back to simple text redaction
    console.warn(
      'Markdown parsing failed during redaction, falling back to text redaction:',
      error.message
    )
    return redact_text_content(markdown_content)
  }
}

/**
 * Detects if content is likely markdown
 *
 * @param {string} content - Content to check
 * @param {string} file_extension - File extension hint
 * @returns {boolean} True if content appears to be markdown
 */
export const is_markdown_content = (file_extension) => {
  return /\.(md|markdown|mdown)$/i.test(file_extension)
}
