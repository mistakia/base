import { parse_markdown } from '#libs-server/markdown/parser.mjs'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Load a prompt from a markdown entity file
 *
 * @param {Object} params
 * @param {string} params.prompt_path - Path to the prompt markdown file
 * @returns {Promise<{ content: string, metadata: object }>} Parsed prompt content and metadata
 */
export default async function load_prompt({ prompt_path }) {
  const resolved_path = path.resolve(prompt_path)
  const file_content = await fs.readFile(resolved_path, 'utf8')
  const { frontmatter, content } = parse_markdown({ markdown: file_content })
  return {
    content: content.trim(),
    metadata: frontmatter
  }
}
