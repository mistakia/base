import MarkdownIt from 'markdown-it'
import frontMatter from 'front-matter'
import scanner from './scanner.mjs'
import path from 'path'
import debug from 'debug'

const log = debug('markdown:parser')

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})

/**
 * Parse markdown file content with frontmatter
 * @param {Object} file File metadata object or content string
 * @returns {Object} Parsed markdown data
 */
export async function parse_markdown(file) {
  // Validate input
  if (!file) {
    throw new Error('file is required')
  }

  try {
    let content
    let file_info

    // Handle direct content passed in file object
    if (typeof file === 'string') {
      content = file
      file_info = { file_path: 'unknown.md' }
    } else if (file.content) {
      content = file.content
      file_info = file
    } else {
      // Get file content from git
      content = await scanner.get_file_content(file)
      file_info = file
    }

    // Extract frontmatter
    const { attributes, body } = frontMatter(content)

    // Ensure frontmatter has basic required fields
    if (!attributes.title) {
      attributes.title = path.basename(file_info.file_path, '.md')
    }

    // Infer type from path for schema files
    // Check both schema/file.md and system/schema/file.md patterns
    if (
      (file_info.file_path.startsWith('schema/') ||
        file_info.file_path.startsWith('system/schema/')) &&
      !attributes.type
    ) {
      const filename = path.basename(file_info.file_path, '.md')
      if (filename === 'type_definition' || filename === 'type_extension') {
        attributes.type = filename
      } else {
        attributes.type = 'type_definition'
        attributes.name = filename
      }
    }

    // Throw error if type is not specified in frontmatter
    if (!attributes.type) {
      throw new Error(
        `Type not specified in frontmatter for ${file_info.file_path}`
      )
    }

    // Render markdown to HTML
    const html = md.render(body)

    // Clean invisible characters individually
    let cleaned_content = body
    const invisible_chars = [
      '\u200B',
      '\u200C',
      '\u200D',
      '\u200E',
      '\u200F',
      '\uFEFF'
    ]
    for (const char of invisible_chars) {
      cleaned_content = cleaned_content.replace(new RegExp(`^${char}`, 'g'), '')
    }

    return {
      file_info,
      markdown: body.startsWith('\n') ? body : '\n' + body,
      frontmatter: attributes,
      html,
      content: cleaned_content,
      type: attributes.type
    }
  } catch (error) {
    log(`Error parsing markdown file: ${file.file_path || 'unknown'}`, error)
    throw error
  }
}

/**
 * Parse a schema definition file
 * @param {Object} file File metadata object
 * @returns {Object} Parsed schema definition
 */
export async function parse_schema_file(file) {
  // Validate input
  if (!file || typeof file !== 'object') {
    throw new Error('file must be an object')
  }

  const parsed = await parse_markdown(file)

  // For files in schema directory, set appropriate type and properties
  if (parsed.frontmatter.type === 'type_definition') {
    // Ensure name is set for type definitions
    if (!parsed.frontmatter.name) {
      parsed.frontmatter.name = path.basename(parsed.file_info.file_path, '.md')
    }

    return parsed
  } else if (parsed.frontmatter.type === 'type_extension') {
    // Ensure extends is set for type extensions
    if (!parsed.frontmatter.extends) {
      log(
        `Type extension in ${parsed.file_info.file_path} doesn't specify which type it extends`
      )
    }

    return parsed
  }

  return parsed
}

export default {
  parse_markdown,
  parse_schema_file
}
