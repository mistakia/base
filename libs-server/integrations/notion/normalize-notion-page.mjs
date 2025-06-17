/**
 * Normalize Notion standalone pages to Base entity format
 */

import debug from 'debug'
import { randomUUID } from 'crypto'

const log = debug('integrations:notion:normalize-page')

/**
 * Extract plain text from Notion rich text array
 * @param {Array} rich_text - Notion rich text array
 * @returns {string} Plain text content
 */
function extract_plain_text(rich_text) {
  if (!Array.isArray(rich_text)) return ''
  return rich_text.map(item => item.plain_text || '').join('')
}

/**
 * Convert Notion blocks to markdown content
 * @param {Array} blocks - Array of Notion block objects
 * @returns {string} Markdown content
 */
function blocks_to_markdown(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return ''
  }

  const markdown_lines = []

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
        if (block.paragraph?.rich_text) {
          const text = extract_plain_text(block.paragraph.rich_text)
          if (text.trim()) {
            markdown_lines.push(text)
            markdown_lines.push('') // Add blank line after paragraph
          }
        }
        break

      case 'heading_1':
        if (block.heading_1?.rich_text) {
          const text = extract_plain_text(block.heading_1.rich_text)
          if (text.trim()) {
            markdown_lines.push(`# ${text}`)
            markdown_lines.push('')
          }
        }
        break

      case 'heading_2':
        if (block.heading_2?.rich_text) {
          const text = extract_plain_text(block.heading_2.rich_text)
          if (text.trim()) {
            markdown_lines.push(`## ${text}`)
            markdown_lines.push('')
          }
        }
        break

      case 'heading_3':
        if (block.heading_3?.rich_text) {
          const text = extract_plain_text(block.heading_3.rich_text)
          if (text.trim()) {
            markdown_lines.push(`### ${text}`)
            markdown_lines.push('')
          }
        }
        break

      case 'bulleted_list_item':
        if (block.bulleted_list_item?.rich_text) {
          const text = extract_plain_text(block.bulleted_list_item.rich_text)
          if (text.trim()) {
            markdown_lines.push(`- ${text}`)
          }
        }
        break

      case 'numbered_list_item':
        if (block.numbered_list_item?.rich_text) {
          const text = extract_plain_text(block.numbered_list_item.rich_text)
          if (text.trim()) {
            markdown_lines.push(`1. ${text}`)
          }
        }
        break

      case 'code':
        if (block.code?.rich_text) {
          const text = extract_plain_text(block.code.rich_text)
          const language = block.code.language || ''
          markdown_lines.push(`\`\`\`${language}`)
          markdown_lines.push(text)
          markdown_lines.push('```')
          markdown_lines.push('')
        }
        break

      case 'quote':
        if (block.quote?.rich_text) {
          const text = extract_plain_text(block.quote.rich_text)
          if (text.trim()) {
            markdown_lines.push(`> ${text}`)
            markdown_lines.push('')
          }
        }
        break

      default:
        // For unsupported block types, try to extract any text content
        log(`Unsupported block type: ${block.type}`)
        if (block[block.type]?.rich_text) {
          const text = extract_plain_text(block[block.type].rich_text)
          if (text.trim()) {
            markdown_lines.push(text)
            markdown_lines.push('')
          }
        }
    }

    // Handle nested children blocks recursively
    if (block.children && Array.isArray(block.children)) {
      const child_markdown = blocks_to_markdown(block.children)
      if (child_markdown.trim()) {
        // Indent child content
        const indented_lines = child_markdown.split('\n').map(line =>
          line.trim() ? `  ${line}` : line
        )
        markdown_lines.push(...indented_lines)
      }
    }
  }

  return markdown_lines.join('\n').trim()
}

/**
 * Normalize a Notion standalone page to Base entity format
 * @param {Object} notion_page - Notion page object with blocks
 * @returns {Object} Normalized entity data
 */
export function normalize_notion_page(notion_page) {
  try {
    log(`Normalizing Notion page: ${notion_page.id}`)

    // Extract title from page properties or default
    let title = 'Untitled'
    if (notion_page.properties?.title?.title) {
      title = extract_plain_text(notion_page.properties.title.title)
    } else if (notion_page.properties) {
      // Look for any title-like property
      const title_props = Object.values(notion_page.properties).find(prop =>
        prop.type === 'title' && prop.title
      )
      if (title_props) {
        title = extract_plain_text(title_props.title)
      }
    }

    // Convert blocks to markdown content
    const content = blocks_to_markdown(notion_page.blocks || [])

    // Create Base entity structure
    const entity = {
      entity_id: randomUUID(),
      type: 'text', // Standalone pages become text entities
      name: title.trim() || 'Untitled',
      content,
      external_id: `notion:page:${notion_page.id}`,
      created_at: notion_page.created_time || new Date().toISOString(),
      updated_at: notion_page.last_edited_time || new Date().toISOString(),

      // Additional metadata
      notion_metadata: {
        notion_id: notion_page.id,
        notion_url: notion_page.url,
        created_by: notion_page.created_by,
        last_edited_by: notion_page.last_edited_by,
        archived: notion_page.archived || false,
        properties: notion_page.properties || {}
      }
    }

    // Add description if available
    if (content.length > 200) {
      entity.description = content.substring(0, 200) + '...'
    } else if (content.length > 0) {
      entity.description = content
    }

    log(`Normalized page to text entity: ${entity.name}`)
    return entity
  } catch (error) {
    log(`Failed to normalize Notion page: ${error.message}`)
    throw new Error(`Failed to normalize Notion page: ${error.message}`)
  }
}
