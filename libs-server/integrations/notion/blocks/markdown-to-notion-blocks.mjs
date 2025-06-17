/**
 * Convert markdown content to Notion blocks
 */

import debug from 'debug'

const log = debug('integrations:notion:blocks:from-markdown')

/**
 * Parse markdown text into rich text array for Notion
 * @param {string} text - Plain text with simple markdown formatting
 * @returns {Array} Notion rich text array
 */
function parse_rich_text(text) {
  if (!text || typeof text !== 'string') {
    return []
  }

  // For now, return simple rich text
  // TODO: Parse markdown formatting (**bold**, *italic*, etc.)
  return [
    {
      type: 'text',
      text: { content: text },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: 'default'
      }
    }
  ]
}

/**
 * Convert markdown lines to Notion blocks
 * @param {Array} lines - Array of markdown lines
 * @returns {Array} Array of Notion block objects
 */
function lines_to_notion_blocks(lines) {
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()

    // Skip empty lines
    if (!line) {
      i++
      continue
    }

    // Headings
    if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: parse_rich_text(line.substring(2))
        }
      })
    } else if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: parse_rich_text(line.substring(3))
        }
      })
    } else if (line.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: parse_rich_text(line.substring(4))
        }
      })
    }

    // Bulleted list
    else if (line.startsWith('- ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: parse_rich_text(line.substring(2))
        }
      })
    }

    // Numbered list
    else if (line.match(/^\d+\.\s/)) {
      const text = line.replace(/^\d+\.\s/, '')
      blocks.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: parse_rich_text(text)
        }
      })
    }

    // Todo/checkbox
    else if (line.match(/^-\s\[[ x]\]\s/)) {
      const checked = line.includes('[x]')
      const text = line.replace(/^-\s\[[ x]\]\s/, '')
      blocks.push({
        object: 'block',
        type: 'to_do',
        to_do: {
          rich_text: parse_rich_text(text),
          checked
        }
      })
    }

    // Quote
    else if (line.startsWith('> ')) {
      blocks.push({
        object: 'block',
        type: 'quote',
        quote: {
          rich_text: parse_rich_text(line.substring(2))
        }
      })
    }

    // Divider
    else if (line === '---' || line === '***') {
      blocks.push({
        object: 'block',
        type: 'divider',
        divider: {}
      })
    }

    // Code blocks
    else if (line.startsWith('```')) {
      const language = line.substring(3).trim()
      const code_lines = []
      i++ // Move past opening ```

      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code_lines.push(lines[i])
        i++
      }

      blocks.push({
        object: 'block',
        type: 'code',
        code: {
          rich_text: [
            {
              type: 'text',
              text: { content: code_lines.join('\n') }
            }
          ],
          language: language || 'plain text'
        }
      })
    }

    // Regular paragraph
    else {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: parse_rich_text(line)
        }
      })
    }

    i++
  }

  return blocks
}

/**
 * Convert markdown content to Notion blocks
 * @param {string} markdown - Markdown content
 * @param {Object} options - Conversion options
 * @returns {Array} Array of Notion block objects
 */
export function markdown_to_notion_blocks(markdown, options = {}) {
  if (!markdown || typeof markdown !== 'string') {
    return []
  }

  try {
    // Split markdown into lines
    const lines = markdown.split('\n')

    // Convert lines to blocks
    const blocks = lines_to_notion_blocks(lines)

    log(`Converted markdown to ${blocks.length} Notion blocks`)
    return blocks
  } catch (error) {
    log(`Error converting markdown to blocks: ${error.message}`)
    throw new Error(`Failed to convert markdown to Notion blocks: ${error.message}`)
  }
}

/**
 * Convert simple text to a single paragraph block
 * @param {string} text - Plain text content
 * @returns {Array} Array with single paragraph block
 */
export function text_to_paragraph_block(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return []
  }

  return [
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: parse_rich_text(text.trim())
      }
    }
  ]
}

/**
 * Create a heading block
 * @param {string} text - Heading text
 * @param {number} level - Heading level (1-3)
 * @returns {Object} Notion heading block
 */
export function create_heading_block(text, level = 1) {
  const heading_type = `heading_${Math.min(Math.max(level, 1), 3)}`

  return {
    object: 'block',
    type: heading_type,
    [heading_type]: {
      rich_text: parse_rich_text(text)
    }
  }
}

/**
 * Create a bulleted list item block
 * @param {string} text - List item text
 * @returns {Object} Notion bulleted list item block
 */
export function create_list_item_block(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: parse_rich_text(text)
    }
  }
}
