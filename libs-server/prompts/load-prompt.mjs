import { promises as fs } from 'fs'
import path from 'path'

import { parse_markdown_content } from '#libs-server/markdown/processor/markdown-parser.mjs'

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
  const { frontmatter, content } = parse_markdown_content({
    content: file_content,
    file_path: prompt_path
  })
  return {
    content: content.trim(),
    metadata: frontmatter
  }
}
