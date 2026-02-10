/**
 * Convert Notion blocks to markdown content
 */

import debug from 'debug'
import path from 'path'
import { extract_plain_text } from '../notion-utils.mjs'
import {
  get_block_spacing,
  get_spacing_context,
  normalize_spacing
} from './block-transition-rules.mjs'
import { store_file } from '#libs-server/files/index.mjs'
import { sanitize_for_filename } from '#libs-server/utils/sanitize-filename.mjs'
import { find_entity_for_notion_page } from '../entity/find-entity-for-notion-page.mjs'
import config from '#config'

const log = debug('integrations:notion:blocks:to-markdown')

/**
 * Extract heading level from block type
 * @param {string} block_type - Block type string
 * @returns {number} Heading level (1, 2, or 3)
 */
function get_heading_level(block_type) {
  return parseInt(block_type.split('_')[1])
}

/**
 * Convert rich text to plain text with optional formatting preservation
 * @param {Array} rich_text - Rich text array
 * @param {Object} options - Options object
 * @returns {string} Plain text content
 */
function extract_text_content(rich_text, options = {}) {
  if (!rich_text) return ''

  const text = extract_plain_text(rich_text, {
    preserve_formatting: options.preserve_formatting ?? true
  })

  return text.trim()
}

/**
 * Handle heading blocks (heading_1, heading_2, heading_3)
 * @param {Object} block - Notion block object
 * @param {Object} options - Conversion options
 * @param {string} indent - Current indentation
 * @returns {string} Markdown content
 */
function convert_heading_block(block, options, indent) {
  const level = get_heading_level(block.type)
  const text = extract_text_content(block[block.type]?.rich_text, options)

  if (!text) return ''

  const hashes = '#'.repeat(level)
  return `${indent}${hashes} ${text}\n\n`
}

/**
 * Handle list item blocks (bulleted_list_item, numbered_list_item, to_do)
 * @param {Object} block - Notion block object
 * @param {Object} options - Conversion options
 * @param {string} indent - Current indentation
 * @returns {string} Markdown content
 */
function convert_list_item_block(block, options, indent) {
  const text = extract_text_content(block[block.type]?.rich_text, options)
  if (!text) return ''

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
 * Download file from URL and return as buffer
 * @param {string} url - URL to download from
 * @param {Object} options - Download options
 * @param {number} [options.timeout_ms=30000] - Timeout in milliseconds
 * @returns {Promise<Buffer>} File content as buffer
 */
async function download_file(url, { timeout_ms = 30000 } = {}) {
  const controller = new AbortController()
  const timeout_id = setTimeout(() => controller.abort(), timeout_ms)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(
        `Failed to download file: ${response.status} ${response.statusText}`
      )
    }
    return Buffer.from(await response.arrayBuffer())
  } finally {
    clearTimeout(timeout_id)
  }
}

/**
 * Store downloaded file and return storage result
 *
 * Files are stored adjacent to the entity in entity_files_directory.
 * CID-based deduplication ensures identical files aren't stored twice.
 *
 * @param {Buffer} file_content - File content as buffer
 * @param {string} filename - Original filename
 * @param {Object} options - Storage options
 * @param {string} [options.source_url] - Original URL of the file
 * @param {string} options.entity_files_directory - Directory for entity-adjacent storage (required)
 * @returns {Promise<Object>} Storage result with base_uri
 */
async function store_downloaded_file(file_content, filename, options = {}) {
  const { source_url, entity_files_directory } = options

  if (!entity_files_directory) {
    throw new Error('entity_files_directory is required for file storage')
  }

  // Sanitize filename for filesystem
  const safe_filename = sanitize_for_filename(filename, {
    maxLength: 100,
    fallback: 'file'
  })

  const target_path = path.join(entity_files_directory, safe_filename)

  const result = await store_file({
    file_content,
    target_path,
    original_name: filename,
    source_uri: source_url,
    context: 'notion'
  })

  return result
}

/**
 * Handle image block conversion
 * @param {Object} block - Image block object
 * @param {string} indent - Current indentation
 * @param {Object} options - Conversion options
 * @param {string} [options.entity_files_directory] - Directory for entity-adjacent storage
 * @returns {Promise<string>} Markdown content
 */
async function convert_image_block(block, indent, options = {}) {
  if (!block.image) return ''

  const url = block.image.file?.url || block.image.external?.url
  if (!url) return ''

  const caption = extract_text_content(block.image.caption, {
    preserve_formatting: false
  })

  // Handle Notion-hosted files
  if (block.image.file?.url) {
    try {
      const file_content = await download_file(url)
      // Extract extension from URL or use default
      const url_path = new URL(url).pathname
      const ext = path.extname(url_path) || '.png'
      const filename = `image-${block.id.slice(0, 8)}${ext}`

      const storage_result = await store_downloaded_file(
        file_content,
        filename,
        {
          source_url: url,
          entity_files_directory: options.entity_files_directory
        }
      )
      return `${indent}![${caption}](${storage_result.base_uri})\n\n`
    } catch (error) {
      log(`Failed to download and store image: ${error.message}`)
      return `${indent}![${caption}](${url})\n\n`
    }
  }

  // External URL
  return `${indent}![${caption}](${url})\n\n`
}

/**
 * Handle video block conversion
 * @param {Object} block - Video block object
 * @param {string} indent - Current indentation
 * @param {Object} options - Conversion options
 * @param {string} [options.entity_files_directory] - Directory for entity-adjacent storage
 * @returns {Promise<string>} Markdown content
 */
async function convert_video_block(block, indent, options = {}) {
  if (!block.video) return ''

  const url = block.video.file?.url || block.video.external?.url
  if (!url) return ''

  // Handle Notion-hosted files
  if (block.video.file?.url) {
    try {
      const file_content = await download_file(url)
      // Extract extension from URL or use default
      const url_path = new URL(url).pathname
      const ext = path.extname(url_path) || '.mp4'
      const filename = `video-${block.id.slice(0, 8)}${ext}`

      const storage_result = await store_downloaded_file(
        file_content,
        filename,
        {
          source_url: url,
          entity_files_directory: options.entity_files_directory
        }
      )
      return `${indent}[Video](${storage_result.base_uri})\n\n`
    } catch (error) {
      log(`Failed to download and store video: ${error.message}`)
      return `${indent}[Video](${url})\n\n`
    }
  }

  return `${indent}[Video](${url})\n\n`
}

/**
 * Handle file block conversion
 * @param {Object} block - File block object
 * @param {string} indent - Current indentation
 * @param {Object} options - Conversion options
 * @param {string} [options.entity_files_directory] - Directory for entity-adjacent storage
 * @returns {Promise<string>} Markdown content
 */
async function convert_file_block(block, indent, options = {}) {
  if (!block.file) return ''

  const url = block.file.file?.url || block.file.external?.url
  if (!url) return ''

  const name = block.file.name || 'File'

  // Handle Notion-hosted files
  if (block.file.file?.url) {
    try {
      const file_content = await download_file(url)
      // Use original filename or generate one with extension from URL
      const url_path = new URL(url).pathname
      const ext = path.extname(url_path) || ''
      const filename = name || `file-${block.id.slice(0, 8)}${ext}`

      const storage_result = await store_downloaded_file(
        file_content,
        filename,
        {
          source_url: url,
          entity_files_directory: options.entity_files_directory
        }
      )
      return `${indent}[${name}](${storage_result.base_uri})\n\n`
    } catch (error) {
      log(`Failed to download and store file: ${error.message}`)
      return `${indent}[${name}](${url})\n\n`
    }
  }

  return `${indent}[${name}](${url})\n\n`
}

/**
 * Handle media blocks (image, video, file, bookmark, embed)
 * @param {Object} block - Notion block object
 * @param {string} indent - Current indentation
 * @param {Object} options - Conversion options
 * @param {string} [options.entity_files_directory] - Directory for entity-adjacent storage
 * @returns {Promise<string>} Markdown content
 */
async function convert_media_block(block, indent, options = {}) {
  switch (block.type) {
    case 'image':
      return await convert_image_block(block, indent, options)

    case 'video':
      return await convert_video_block(block, indent, options)

    case 'file':
      return await convert_file_block(block, indent, options)

    case 'bookmark':
      if (block.bookmark?.url) {
        const caption =
          extract_text_content(block.bookmark.caption, {
            preserve_formatting: false
          }) || block.bookmark.url
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
 * Handle child page block conversion with entity lookup
 * @param {Object} block - Child page block object
 * @param {string} indent - Current indentation
 * @returns {Promise<string>} Markdown content
 */
async function convert_child_page_block(block, indent) {
  if (!block.child_page?.title) return ''

  const child_page_id = block.id
  const child_external_id = `notion:page:${child_page_id}`

  const normalized_child_entity = {
    name: block.child_page.title,
    title: block.child_page.title,
    type: 'text'
  }

  try {
    const existing_entity = await find_entity_for_notion_page(
      child_external_id,
      normalized_child_entity
    )

    if (existing_entity) {
      const user_base_directory = config.user_base_directory
      if (
        user_base_directory &&
        existing_entity.absolute_path.startsWith(user_base_directory)
      ) {
        const relative_path = path.relative(
          user_base_directory,
          existing_entity.absolute_path
        )
        const base_uri = `user:${relative_path}`
        return `${indent}[[${base_uri}]]\n\n`
      }
    }
  } catch (error) {
    log(
      `Error finding child page entity: ${error.message}, falling back to static logic`
    )
  }

  // Fallback to static logic
  const safe_name = sanitize_for_filename(block.child_page.title, {
    maxLength: 100,
    fallback: 'untitled-child-page'
  })
  const base_uri = `user:text/${safe_name}.md`
  return `${indent}[[${base_uri}]]\n\n`
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
  const indent = '  '.repeat(depth)

  // Get spacing context and apply transition rules
  const spacing_context = get_spacing_context(block, previous_block)
  const transition_spacing = get_block_spacing(
    previous_block?.type,
    block.type,
    previous_depth,
    depth,
    spacing_context
  )

  let markdown = ''

  // Add block ID as comment if requested
  if (include_ids) {
    markdown += `<!-- Block ID: ${block.id} -->\n`
  }

  // Add transition spacing
  markdown += transition_spacing

  // Convert block based on type
  switch (block.type) {
    case 'paragraph':
      if (block.paragraph?.rich_text) {
        const text = extract_text_content(block.paragraph.rich_text, {
          preserve_formatting
        })
        if (text) {
          const clean_text = text.replace(/\n+/g, '\n').trim()
          markdown += `${indent}${clean_text}\n\n`
        } else if (block.paragraph.rich_text.length === 0) {
          markdown += '\n'
        }
      }
      break

    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      markdown += convert_heading_block(block, { preserve_formatting }, indent)
      break

    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'to_do':
      markdown += convert_list_item_block(
        block,
        { preserve_formatting },
        indent
      )
      break

    case 'toggle':
      if (block.toggle?.rich_text) {
        const text = extract_text_content(block.toggle.rich_text, {
          preserve_formatting
        })
        if (text) {
          markdown += `${indent}<details>\n${indent}<summary>${text}</summary>\n\n`
        }
      }
      break

    case 'code':
      if (block.code?.rich_text) {
        const text = extract_text_content(block.code.rich_text, {
          preserve_formatting: false
        })
        const language = block.code.language || ''
        markdown += `${indent}\`\`\`${language}\n${text}\n${indent}\`\`\`\n\n`
      }
      break

    case 'quote':
      if (block.quote?.rich_text) {
        const text = extract_text_content(block.quote.rich_text, {
          preserve_formatting
        })
        if (text) {
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
        const text = extract_text_content(block.callout.rich_text, {
          preserve_formatting
        })
        const icon = block.callout.icon?.emoji || 'Info'
        if (text) {
          markdown += `${indent}> ${icon} ${text}\n\n`
        }
      }
      break

    case 'divider':
      markdown += `${indent}---\n\n`
      break

    case 'table':
      markdown += `${indent}<!-- Table content not fully supported -->\n\n`
      break

    case 'image':
    case 'video':
    case 'file':
    case 'bookmark':
    case 'embed':
      markdown += await convert_media_block(block, indent, options)
      break

    case 'equation':
      if (block.equation?.expression) {
        markdown += `${indent}$$${block.equation.expression}$$\n\n`
      }
      break

    case 'child_page':
      markdown += await convert_child_page_block(block, indent)
      break

    case 'table_of_contents':
      markdown += `${indent}<!-- Table of Contents -->\n\n`
      break

    case 'column_list':
      markdown += `${indent}<!-- Multi-column layout -->\n\n`
      break

    case 'column':
      // Individual column - process normally with slight indentation
      break

    case 'child_database':
      if (block.child_database?.title) {
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
        const text = extract_text_content(block[block.type].rich_text, {
          preserve_formatting
        })
        if (text) {
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
        // Track depth context for proper spacing
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
