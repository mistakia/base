/**
 * Convert Notion blocks to markdown content
 */

import debug from 'debug'
import { extract_plain_text } from '../notion-utils.mjs'
import {
  get_block_spacing,
  get_spacing_context,
  normalize_spacing
} from './block-transition-rules.mjs'
import { store_file_with_content_identifier } from '#libs-server/utils/store-file-with-content-identifier.mjs'

const log = debug('integrations:notion:blocks:to-markdown')

/**
 * Handle heading blocks (heading_1, heading_2, heading_3)
 * @param {Object} block - Notion block object
 * @param {Object} options - Conversion options
 * @param {string} indent - Current indentation
 * @returns {string} Markdown content
 */
function handle_heading_block(block, options, indent) {
  const level = parseInt(block.type.split('_')[1]) // Extract 1, 2, or 3
  const rich_text = block[block.type]?.rich_text

  if (rich_text) {
    const text = extract_plain_text(rich_text, {
      preserve_formatting: options.preserve_formatting
    })
    if (text.trim()) {
      const hashes = '#'.repeat(level)
      return `${indent}${hashes} ${text}\n\n`
    }
  }
  return ''
}

/**
 * Handle list item blocks (bulleted_list_item, numbered_list_item, to_do)
 * @param {Object} block - Notion block object
 * @param {Object} options - Conversion options
 * @param {string} indent - Current indentation
 * @returns {string} Markdown content
 */
function handle_list_item_block(block, options, indent) {
  const rich_text = block[block.type]?.rich_text
  if (!rich_text) return ''

  const text = extract_plain_text(rich_text, {
    preserve_formatting: options.preserve_formatting
  })
  if (!text.trim()) return ''

  switch (block.type) {
    case 'bulleted_list_item':
      return `${indent}- ${text}\n`

    case 'numbered_list_item':
      return `${indent}1. ${text}\n`

    case 'to_do': {
      const checked = block.to_do.checked ? 'x' : ' '
      return `${indent}- [${checked}] ${text}\n`
    }

    default:
      return ''
  }
}

/**
 * Download file from URL
 * @param {string} url - URL to download from
 * @returns {Promise<Buffer>} File content as buffer
 */
async function download_file(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to download file: ${response.status} ${response.statusText}`
    )
  }
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Handle media blocks (image, video, file, bookmark, embed)
 * @param {Object} block - Notion block object
 * @param {string} indent - Current indentation
 * @returns {Promise<string>} Markdown content
 */
async function handle_media_block(block, indent) {
  switch (block.type) {
    case 'image':
      if (block.image) {
        const url = block.image.file?.url || block.image.external?.url
        const caption = block.image.caption
          ? extract_plain_text(block.image.caption, {
              preserve_formatting: false
            })
          : ''

        if (url) {
          // Check if this is a Notion-hosted file (has file.url, not external.url)
          if (block.image.file?.url) {
            try {
              const file_content = await download_file(url)
              const storage_result = await store_file_with_content_identifier({
                file_content,
                original_filename: `image-${block.id}`
              })
              return `${indent}![${caption}](${storage_result.base_uri})\n\n`
            } catch (error) {
              log(`Failed to download and store image: ${error.message}`)
              // Fallback to original URL
              return `${indent}![${caption}](${url})\n\n`
            }
          } else {
            // External URL, use as-is
            return `${indent}![${caption}](${url})\n\n`
          }
        }
      }
      break

    case 'video':
      if (block.video) {
        const url = block.video.file?.url || block.video.external?.url
        if (url) {
          // Check if this is a Notion-hosted file
          if (block.video.file?.url) {
            try {
              const file_content = await download_file(url)
              const storage_result = await store_file_with_content_identifier({
                file_content,
                original_filename: `video-${block.id}`
              })
              return `${indent}[Video](${storage_result.base_uri})\n\n`
            } catch (error) {
              log(`Failed to download and store video: ${error.message}`)
              return `${indent}[Video](${url})\n\n`
            }
          } else {
            return `${indent}[Video](${url})\n\n`
          }
        }
      }
      break

    case 'file':
      if (block.file) {
        const url = block.file.file?.url || block.file.external?.url
        const name = block.file.name || 'File'
        if (url) {
          // Check if this is a Notion-hosted file
          if (block.file.file?.url) {
            try {
              const file_content = await download_file(url)
              const storage_result = await store_file_with_content_identifier({
                file_content,
                original_filename: block.file.name || `file-${block.id}`
              })
              return `${indent}[${name}](${storage_result.base_uri})\n\n`
            } catch (error) {
              log(`Failed to download and store file: ${error.message}`)
              return `${indent}[${name}](${url})\n\n`
            }
          } else {
            return `${indent}[${name}](${url})\n\n`
          }
        }
      }
      break

    case 'bookmark':
      if (block.bookmark?.url) {
        const caption = block.bookmark.caption
          ? extract_plain_text(block.bookmark.caption, {
              preserve_formatting: false
            })
          : block.bookmark.url
        return `${indent}[${caption}](${block.bookmark.url})\n\n`
      }
      break

    case 'embed':
      if (block.embed?.url) {
        return `${indent}[Embedded content](${block.embed.url})\n\n`
      }
      break
  }
  return ''
}

/**
 * Convert a single Notion block to markdown
 * @param {Object} block - Notion block object
 * @param {Object} options - Conversion options
 * @param {number} depth - Current nesting depth
 * @param {Object} previous_block - Previous block for spacing context
 * @param {number} previous_depth - Previous block depth
 * @returns {Promise<Object>} { markdown: string, block_type: string, depth: number }
 */
async function convert_block_to_markdown(
  block,
  options = {},
  depth = 0,
  previous_block = null,
  previous_depth = 0
) {
  const { preserve_formatting = true, include_ids = false } = options
  const indent = '  '.repeat(depth) // 2 spaces per indent level

  // Get spacing context and apply transition rules
  const spacing_context = get_spacing_context(block, previous_block)
  const transition_spacing = get_block_spacing(
    previous_block?.type,
    block.type,
    previous_depth,
    depth,
    spacing_context
  )

  // Add block ID as comment if requested
  let markdown = include_ids ? `<!-- Block ID: ${block.id} -->\n` : ''

  // Add transition spacing
  markdown += transition_spacing

  switch (block.type) {
    case 'paragraph':
      if (block.paragraph?.rich_text) {
        const text = extract_plain_text(block.paragraph.rich_text, {
          preserve_formatting
        })
        if (text.trim()) {
          // Handle embedded newlines in the text content properly
          const cleanText = text.replace(/\n+/g, '\n').trim()
          markdown += `${indent}${cleanText}\n\n`
        } else if (block.paragraph.rich_text.length === 0) {
          // Empty paragraph represents intentional spacing - add blank line
          markdown += '\n'
        }
      }
      break

    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      markdown += handle_heading_block(block, { preserve_formatting }, indent)
      break

    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'to_do':
      markdown += handle_list_item_block(block, { preserve_formatting }, indent)
      break

    case 'toggle':
      if (block.toggle?.rich_text) {
        const text = extract_plain_text(block.toggle.rich_text, {
          preserve_formatting
        })
        if (text.trim()) {
          markdown += `${indent}<details>\n${indent}<summary>${text}</summary>\n\n`
          // Children will be added after this
          // markdown += `${indent}</details>\n\n`
        }
      }
      break

    case 'code':
      if (block.code?.rich_text) {
        const text = extract_plain_text(block.code.rich_text, {
          preserve_formatting: false
        })
        const language = block.code.language || ''
        markdown += `${indent}\`\`\`${language}\n${text}\n${indent}\`\`\`\n\n`
      }
      break

    case 'quote':
      if (block.quote?.rich_text) {
        const text = extract_plain_text(block.quote.rich_text, {
          preserve_formatting
        })
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
        const text = extract_plain_text(block.callout.rich_text, {
          preserve_formatting
        })
        const icon = block.callout.icon?.emoji || 'Info'
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
    case 'video':
    case 'file':
    case 'bookmark':
    case 'embed':
      markdown += await handle_media_block(block, indent)
      break

    case 'equation':
      if (block.equation?.expression) {
        markdown += `${indent}$$${block.equation.expression}$$\n\n`
      }
      break

    case 'child_page':
      if (block.child_page?.title) {
        // Convert child page title to proper base-uri format for knowledge base linking
        // Format: user:text/filename.md (following RFC 3986)
        const safe_name = block.child_page.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
          .replace(/\s+/g, '-') // Replace spaces with hyphens
          .replace(/-+/g, '-') // Remove multiple consecutive hyphens
          .replace(/^-|-$/g, '') // Remove leading/trailing hyphens

        const base_uri = `user:text/${safe_name}.md`
        markdown += `${indent}[[${base_uri}]]\n\n`
      }
      break

    case 'table_of_contents':
      // Table of contents - just add a placeholder since it's dynamic
      markdown += `${indent}<!-- Table of Contents -->\n\n`
      break

    case 'column_list':
      // Column list container - process children in columns
      markdown += `${indent}<!-- Multi-column layout -->\n\n`
      break

    case 'column':
      // Individual column - process normally with slight indentation
      // Children will be processed normally
      break

    case 'child_database':
      if (block.child_database?.title) {
        // Convert child database reference to a simple link placeholder
        const database_title = block.child_database.title
        markdown += `${indent}**Database**: ${database_title}\n\n`
      } else {
        markdown += `${indent}**Database**\n\n`
      }
      break

    default:
      // For unsupported block types, try to extract any text content
      log(`Unsupported block type: ${block.type}`)
      if (block[block.type]?.rich_text) {
        const text = extract_plain_text(block[block.type].rich_text, {
          preserve_formatting
        })
        if (text.trim()) {
          markdown += `${indent}${text}\n\n`
        }
      }
  }

  // Handle children blocks recursively
  if (block.children && Array.isArray(block.children)) {
    const children_markdown = await notion_blocks_to_markdown(
      block.children,
      options,
      depth + 1
    )
    markdown += children_markdown

    // Close toggle if it was opened
    if (block.type === 'toggle' && block.toggle?.rich_text) {
      markdown += `${indent}</details>\n\n`
    }
  }

  return {
    markdown,
    block_type: block.type,
    depth
  }
}

/**
 * Convert Notion blocks array to markdown content
 * @param {Array} blocks - Array of Notion block objects
 * @param {Object} options - Conversion options
 * @param {number} depth - Current nesting depth (internal)
 * @returns {Promise<string>} Markdown content
 */
export async function notion_blocks_to_markdown(
  blocks,
  options = {},
  depth = 0
) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return ''
  }

  try {
    let markdown = ''
    let previous_block = null
    let previous_depth = depth
    let had_children = false

    for (const block of blocks) {
      if (block && typeof block === 'object') {
        // If the previous block had children, we need to track that we're coming back from a deeper level
        const effective_previous_depth = had_children
          ? depth + 1
          : previous_depth

        const result = await convert_block_to_markdown(
          block,
          options,
          depth,
          previous_block,
          effective_previous_depth
        )

        markdown += result.markdown

        // Update tracking for next iteration
        previous_block = block
        previous_depth = depth
        had_children =
          block.children &&
          Array.isArray(block.children) &&
          block.children.length > 0
      }
    }

    // Normalize spacing while preserving intentional gaps
    markdown = normalize_spacing(markdown)

    // Only trim trailing whitespace, preserve leading indentation
    return markdown.trimEnd()
  } catch (error) {
    log(`Error converting blocks to markdown: ${error.message}`)
    throw new Error(
      `Failed to convert Notion blocks to markdown: ${error.message}`
    )
  }
}
