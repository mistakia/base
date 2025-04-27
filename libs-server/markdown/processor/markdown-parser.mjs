import MarkdownIt from 'markdown-it'
import frontMatter from 'front-matter'
import path from 'path'
import debug from 'debug'

const log = debug('markdown:parser')

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})

/**
 * Parse markdown content with frontmatter
 * @param {Object} params - Parameters object
 * @param {string} params.file_path - Path of the markdown file
 * @param {string} params.content - Content of the markdown file
 * @returns {Object} Parsed markdown data
 */
export async function parse_markdown_content({ file_path, content }) {
  // Validate input
  if (!content) {
    throw new Error('content is required')
  }

  if (!file_path) {
    throw new Error('file_path is required')
  }

  try {
    // Extract frontmatter
    const { attributes, body } = frontMatter(content)

    // Ensure frontmatter has basic required fields
    if (!attributes.title) {
      attributes.title = path.basename(file_path, '.md')
    }

    // Infer type from path for schema files
    // Check both schema/file.md and system/schema/file.md patterns
    if (
      (file_path.startsWith('schema/') ||
        file_path.startsWith('system/schema/')) &&
      !attributes.type
    ) {
      const filename = path.basename(file_path, '.md')
      if (filename === 'type_definition' || filename === 'type_extension') {
        attributes.type = filename
      } else {
        attributes.type = 'type_definition'
        attributes.name = filename
      }
    }

    // Throw error if type is not specified in frontmatter
    if (!attributes.type) {
      throw new Error(`Type not specified in frontmatter for ${file_path}`)
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
      file_path,
      markdown: body.startsWith('\n') ? body : '\n' + body,
      frontmatter: attributes,
      html,
      content: cleaned_content,
      type: attributes.type
    }
  } catch (error) {
    log(`Error parsing markdown file: ${file_path}`, error)
    throw error
  }
}

/**
 * Parse a schema definition file
 * @param {Object} params - Parameters object
 * @param {string} params.file_path - Path of the markdown file
 * @param {string} params.content - Content of the markdown file
 * @returns {Object} Parsed schema definition
 */
export async function parse_markdown_schema_content({ file_path, content }) {
  // Validate input
  if (!content) {
    throw new Error('content is required')
  }

  if (!file_path) {
    throw new Error('file_path is required')
  }

  const parsed_markdown = await parse_markdown_content({ file_path, content })

  // For files in schema directory, set appropriate type and properties
  if (parsed_markdown.frontmatter.type === 'type_definition') {
    // Ensure name is set for type definitions
    if (!parsed_markdown.frontmatter.name) {
      parsed_markdown.frontmatter.name = path.basename(
        parsed_markdown.file_path,
        '.md'
      )
    }

    return parsed_markdown
  } else if (parsed_markdown.frontmatter.type === 'type_extension') {
    // Ensure extends is set for type extensions
    if (!parsed_markdown.frontmatter.extends) {
      log(
        `Type extension in ${parsed_markdown.file_path} doesn't specify which type it extends`
      )
    }

    return parsed_markdown
  }

  return parsed_markdown
}

export default {
  parse_markdown_content,
  parse_markdown_schema_content
}
