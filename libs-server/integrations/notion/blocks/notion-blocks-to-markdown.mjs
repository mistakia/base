/**
 * Convert Notion blocks to markdown content
 */

import debug from 'debug'

const log = debug('integrations:notion:blocks:to-markdown')

/**
 * Extract plain text from Notion rich text array
 * @param {Array} rich_text - Notion rich text array
 * @param {Object} options - Formatting options
 * @returns {string} Formatted text content
 */
function format_rich_text(rich_text, options = {}) {
  if (!Array.isArray(rich_text)) return ''

  return rich_text.map(item => {
    let text = item.plain_text || ''

    // Apply formatting if requested
    if (options.preserve_formatting && item.annotations) {
      const annotations = item.annotations

      if (annotations.bold) text = `**${text}**`
      if (annotations.italic) text = `*${text}*`
      if (annotations.strikethrough) text = `~~${text}~~`
      if (annotations.underline) text = `<u>${text}</u>` // Markdown doesn't have underline
      if (annotations.code) text = `\`${text}\``

      // Handle links
      if (item.href) {
        text = `[${text}](${item.href})`
      }

      // Handle colors (as HTML for now, since markdown is limited)
      if (annotations.color && annotations.color !== 'default') {
        text = `<span style="color: ${annotations.color}">${text}</span>`
      }
    }

    return text
  }).join('')
}

/**
 * Convert a single Notion block to markdown
 * @param {Object} block - Notion block object
 * @param {Object} options - Conversion options
 * @param {number} depth - Current nesting depth
 * @returns {string} Markdown representation
 */
function convert_block_to_markdown(block, options = {}, depth = 0) {
  const { preserve_formatting = true, include_ids = false } = options
  const indent = '  '.repeat(depth) // 2 spaces per indent level

  // Add block ID as comment if requested
  let markdown = include_ids ? `<!-- Block ID: ${block.id} -->\n` : ''

  switch (block.type) {
    case 'paragraph':
      if (block.paragraph?.rich_text) {
        const text = format_rich_text(block.paragraph.rich_text, { preserve_formatting })
        if (text.trim()) {
          markdown += `${indent}${text}\n\n`
        }
      }
      break

    case 'heading_1':
      if (block.heading_1?.rich_text) {
        const text = format_rich_text(block.heading_1.rich_text, { preserve_formatting })
        if (text.trim()) {
          markdown += `${indent}# ${text}\n\n`
        }
      }
      break

    case 'heading_2':
      if (block.heading_2?.rich_text) {
        const text = format_rich_text(block.heading_2.rich_text, { preserve_formatting })
        if (text.trim()) {
          markdown += `${indent}## ${text}\n\n`
        }
      }
      break

    case 'heading_3':
      if (block.heading_3?.rich_text) {
        const text = format_rich_text(block.heading_3.rich_text, { preserve_formatting })
        if (text.trim()) {
          markdown += `${indent}### ${text}\n\n`
        }
      }
      break

    case 'bulleted_list_item':
      if (block.bulleted_list_item?.rich_text) {
        const text = format_rich_text(block.bulleted_list_item.rich_text, { preserve_formatting })
        if (text.trim()) {
          markdown += `${indent}- ${text}\n`
        }
      }
      break

    case 'numbered_list_item':
      if (block.numbered_list_item?.rich_text) {
        const text = format_rich_text(block.numbered_list_item.rich_text, { preserve_formatting })
        if (text.trim()) {
          markdown += `${indent}1. ${text}\n`
        }
      }
      break

    case 'to_do':
      if (block.to_do?.rich_text) {
        const text = format_rich_text(block.to_do.rich_text, { preserve_formatting })
        const checked = block.to_do.checked ? 'x' : ' '
        if (text.trim()) {
          markdown += `${indent}- [${checked}] ${text}\n`
        }
      }
      break

    case 'toggle':
      if (block.toggle?.rich_text) {
        const text = format_rich_text(block.toggle.rich_text, { preserve_formatting })
        if (text.trim()) {
          markdown += `${indent}<details>\n${indent}<summary>${text}</summary>\n\n`
          // Children will be added after this
          // markdown += `${indent}</details>\n\n`
        }
      }
      break

    case 'code':
      if (block.code?.rich_text) {
        const text = format_rich_text(block.code.rich_text, { preserve_formatting: false })
        const language = block.code.language || ''
        markdown += `${indent}\`\`\`${language}\n${text}\n${indent}\`\`\`\n\n`
      }
      break

    case 'quote':
      if (block.quote?.rich_text) {
        const text = format_rich_text(block.quote.rich_text, { preserve_formatting })
        if (text.trim()) {
          // Split multi-line quotes
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.trim()) {
              markdown += `${indent}> ${line}\n`
            }
          }
          markdown += '\n'
        }
      }
      break

    case 'callout':
      if (block.callout?.rich_text) {
        const text = format_rich_text(block.callout.rich_text, { preserve_formatting })
        const icon = block.callout.icon?.emoji || '💡'
        if (text.trim()) {
          markdown += `${indent}> ${icon} ${text}\n\n`
        }
      }
      break

    case 'divider':
      markdown += `${indent}---\n\n`
      break

    case 'table':
      // Tables are complex - simplified implementation
      markdown += `${indent}<!-- Table content not fully supported -->\n\n`
      break

    case 'image':
      if (block.image) {
        const url = block.image.file?.url || block.image.external?.url
        const caption = block.image.caption
          ? format_rich_text(block.image.caption, { preserve_formatting: false })
          : ''
        if (url) {
          markdown += `${indent}![${caption}](${url})\n\n`
        }
      }
      break

    case 'video':
      if (block.video) {
        const url = block.video.file?.url || block.video.external?.url
        if (url) {
          markdown += `${indent}[Video](${url})\n\n`
        }
      }
      break

    case 'file':
      if (block.file) {
        const url = block.file.file?.url || block.file.external?.url
        const name = block.file.name || 'File'
        if (url) {
          markdown += `${indent}[${name}](${url})\n\n`
        }
      }
      break

    case 'bookmark':
      if (block.bookmark?.url) {
        const caption = block.bookmark.caption
          ? format_rich_text(block.bookmark.caption, { preserve_formatting: false })
          : block.bookmark.url
        markdown += `${indent}[${caption}](${block.bookmark.url})\n\n`
      }
      break

    case 'embed':
      if (block.embed?.url) {
        markdown += `${indent}[Embedded content](${block.embed.url})\n\n`
      }
      break

    case 'equation':
      if (block.equation?.expression) {
        markdown += `${indent}$$${block.equation.expression}$$\n\n`
      }
      break

    default:
      // For unsupported block types, try to extract any text content
      log(`Unsupported block type: ${block.type}`)
      if (block[block.type]?.rich_text) {
        const text = format_rich_text(block[block.type].rich_text, { preserve_formatting })
        if (text.trim()) {
          markdown += `${indent}${text}\n\n`
        }
      }
  }

  // Handle children blocks recursively
  if (block.children && Array.isArray(block.children)) {
    const children_markdown = notion_blocks_to_markdown(block.children, options, depth + 1)
    markdown += children_markdown

    // Close toggle if it was opened
    if (block.type === 'toggle' && block.toggle?.rich_text) {
      markdown += `${indent}</details>\n\n`
    }
  }

  return markdown
}

/**
 * Convert Notion blocks array to markdown content
 * @param {Array} blocks - Array of Notion block objects
 * @param {Object} options - Conversion options
 * @param {number} depth - Current nesting depth (internal)
 * @returns {string} Markdown content
 */
export function notion_blocks_to_markdown(blocks, options = {}, depth = 0) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return ''
  }

  try {
    let markdown = ''

    for (const block of blocks) {
      if (block && typeof block === 'object') {
        markdown += convert_block_to_markdown(block, options, depth)
      }
    }

    // Clean up excessive newlines
    markdown = markdown.replace(/\n{3,}/g, '\n\n')

    return markdown.trim()
  } catch (error) {
    log(`Error converting blocks to markdown: ${error.message}`)
    throw new Error(`Failed to convert Notion blocks to markdown: ${error.message}`)
  }
}
