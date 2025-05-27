/**
 * Markdown to Block Structure converter using content-addressable blocks
 */

import fs from 'fs/promises'
import path from 'path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { visit } from 'unist-util-visit'
import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid'
import { BLOCK_TYPES, create_block } from './block-schemas.mjs'

const DEFAULT_CODEC = 0x71 // dag-cbor as a placeholder

/**
 * Convert markdown text to block structure
 * @param {string} markdown_text - The markdown content to convert
 * @param {Object} options - Additional options
 * @param {string} options.file_path - Source file path for document metadata
 * @returns {Object} - Document block containing all child blocks
 */
export async function markdown_to_blocks({ markdown_text, file_path = null }) {
  // Parse markdown into AST
  const ast = unified().use(remarkParse).parse(markdown_text)

  // Track the hierarchy of blocks for parent-child relationships
  const block_map = new Map()
  const now = new Date().toISOString()

  // Create markdown file root block
  const markdown_file_root_block = create_block({
    type: BLOCK_TYPES.MARKDOWN_FILE,
    metadata: {
      created_at: now,
      updated_at: now
    },
    attributes: {
      source_path: file_path,
      title: path.basename(file_path || 'untitled.md', '.md')
    }
  })

  // Process AST nodes recursively to create blocks
  await process_ast_node(ast, markdown_file_root_block)

  // Return the full block structure
  return {
    markdown_file_root_block,
    blocks: Object.fromEntries(block_map)
  }

  /**
   * Process an AST node and convert it to a block
   * @param {Object} node - The AST node
   * @param {Object} parent_block - The parent block
   */
  async function process_ast_node(node, parent_block) {
    // Process node based on its type
    if (node.type === 'root') {
      // Root node - process all children
      for (const child of node.children) {
        await process_ast_node(child, parent_block)
      }
      return
    }

    // Create a block for this node
    const block = await create_block_from_node(node)

    if (!block) return // Skip nodes that don't map to blocks

    // Add to block map
    block_map.set(block.block_cid, block)

    // Update relationships
    if (parent_block) {
      block.relationships.parent = parent_block.block_cid
      parent_block.relationships.children.push(block.block_cid)
    }

    // Process children if any
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        await process_ast_node(child, block)
      }
    }
  }

  /**
   * Create a block from an AST node
   * @param {Object} node - The AST node
   * @returns {Object} - The created block
   */
  async function create_block_from_node(node) {
    let block_type
    let content = ''
    let attributes = {}

    // Map node type to block type
    switch (node.type) {
      case 'paragraph':
        block_type = BLOCK_TYPES.PARAGRAPH
        content = get_text_content(node)
        break
      case 'heading':
        block_type = BLOCK_TYPES.HEADING
        content = get_text_content(node)
        attributes = { level: node.depth }
        break
      case 'list':
        block_type = BLOCK_TYPES.LIST
        attributes = { ordered: node.ordered, spread: node.spread }
        break
      case 'listItem':
        block_type = BLOCK_TYPES.LIST_ITEM
        content = get_text_content(node)
        if (node.checked !== undefined && node.checked !== null) {
          attributes.checked = node.checked
        }
        break
      case 'code':
        block_type = BLOCK_TYPES.CODE
        content = node.value
        attributes = { language: node.lang || '' }
        break
      case 'blockquote':
        block_type = BLOCK_TYPES.BLOCKQUOTE
        content = get_text_content(node)
        break
      case 'thematicBreak':
        block_type = BLOCK_TYPES.THEMATIC_BREAK
        break
      case 'image':
        block_type = BLOCK_TYPES.IMAGE
        attributes = { url: node.url, alt_text: node.alt }
        break
      case 'html':
        block_type = BLOCK_TYPES.HTML_BLOCK
        content = node.value
        break
      default:
        return null // Skip unsupported node types
    }

    // Create the block using our centralized create_block function
    const block = create_block({
      type: block_type,
      content,
      attributes,
      metadata: {
        position: {
          start: node.position?.start
            ? {
                line: node.position.start.line,
                character: node.position.start.column
              }
            : { line: 0, character: 0 },
          end: node.position?.end
            ? {
                line: node.position.end.line,
                character: node.position.end.column
              }
            : { line: 0, character: 0 }
        }
      }
    })

    // Compute content identifier
    block.block_cid = await compute_cid(block)

    return block
  }

  /**
   * Extract text content from a node
   * @param {Object} node - The AST node
   * @returns {string} - The extracted text
   */
  function get_text_content(node) {
    let text = ''
    visit(node, 'text', (text_node) => {
      text += text_node.value
    })
    return text
  }
}

/**
 * Compute content identifier for a block
 * @param {Object} block - The block to compute CID for
 * @returns {string} - The computed CID
 */
export async function compute_cid(block) {
  // Create a content hash input excluding the CID itself
  const { block_cid, ...block_without_cid } = block

  // Hash the block's essential content
  const hash_input = JSON.stringify({
    type: block_without_cid.type,
    content: block_without_cid.content,
    attributes: block_without_cid.attributes
  })

  // Hash the input using SHA-256
  const bytes = new TextEncoder().encode(hash_input)
  const hash = await sha256.digest(bytes)

  // Create a CID using the multihash
  const content_id = CID.create(1, DEFAULT_CODEC, hash)

  return content_id.toString()
}

/**
 * Convert block structure back to markdown
 * @param {Object} document - The document block
 * @param {Object} blocks - Map of all blocks by CID
 * @returns {string} - The markdown representation
 */
export async function blocks_to_markdown({ document, blocks }) {
  // Create a markdown AST from blocks
  const ast = {
    type: 'root',
    children: []
  }

  // Process document block and its children
  await build_ast_from_blocks(document, blocks, ast)

  // Convert AST to markdown
  const markdown = unified().use(remarkStringify).stringify(ast)

  return markdown

  /**
   * Build an AST from block structure
   * @param {Object} block - The current block
   * @param {Object} all_blocks - Map of all blocks by CID
   * @param {Object} parent_node - The parent AST node
   */
  async function build_ast_from_blocks(block, all_blocks, parent_node) {
    // Skip document blocks for AST construction
    if (block.type === BLOCK_TYPES.MARKDOWN_FILE) {
      // Process all children of document
      for (const child_cid of block.relationships.children) {
        const child_block = all_blocks[child_cid]
        if (child_block) {
          await build_ast_from_blocks(child_block, all_blocks, parent_node)
        }
      }
      return
    }

    // Create AST node based on block type
    const node = create_ast_node_from_block(block)

    if (node) {
      // Add node to parent's children
      parent_node.children.push(node)

      // Process children if any
      if (block.relationships.children?.length > 0) {
        for (const child_cid of block.relationships.children) {
          const child_block = all_blocks[child_cid]
          if (child_block) {
            await build_ast_from_blocks(child_block, all_blocks, node)
          }
        }
      }
    }
  }

  /**
   * Create an AST node from a block
   * @param {Object} block - The block to convert
   * @returns {Object} - The created AST node
   */
  function create_ast_node_from_block(block) {
    switch (block.type) {
      case BLOCK_TYPES.PARAGRAPH:
        return {
          type: 'paragraph',
          children: [{ type: 'text', value: block.content }]
        }
      case BLOCK_TYPES.HEADING:
        return {
          type: 'heading',
          depth: block.attributes.level || 1,
          children: [{ type: 'text', value: block.content }]
        }
      case BLOCK_TYPES.LIST:
        return {
          type: 'list',
          ordered: block.attributes.ordered || false,
          spread: block.attributes.spread || false,
          children: []
        }
      case BLOCK_TYPES.LIST_ITEM:
        return {
          type: 'listItem',
          checked: block.attributes.checked,
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: block.content }]
            }
          ]
        }
      case BLOCK_TYPES.CODE:
        return {
          type: 'code',
          lang: block.attributes.language || null,
          value: block.content
        }
      case BLOCK_TYPES.BLOCKQUOTE:
        return {
          type: 'blockquote',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: block.content }]
            }
          ]
        }
      case BLOCK_TYPES.TABLE:
        return {
          type: 'table',
          children: []
        }
      case BLOCK_TYPES.TABLE_ROW:
        return {
          type: 'tableRow',
          children: block.attributes.cells.map((cell) => ({
            type: 'tableCell',
            children: [{ type: 'text', value: cell }]
          }))
        }
      case BLOCK_TYPES.TABLE_CELL:
        return {
          type: 'tableCell',
          children: [{ type: 'text', value: block.content }]
        }
      case BLOCK_TYPES.THEMATIC_BREAK:
        return {
          type: 'thematicBreak'
        }
      case BLOCK_TYPES.IMAGE:
        return {
          type: 'image',
          url: block.attributes.uri || '',
          alt: block.attributes.alt_text || '',
          title: block.attributes.caption || null
        }
      case BLOCK_TYPES.HTML_BLOCK:
        return {
          type: 'html',
          value: block.content
        }
      case BLOCK_TYPES.CALLOUT:
        return {
          type: 'containerDirective',
          name: 'callout',
          attributes: {
            icon: block.attributes.icon || '',
            color: block.attributes.color || 'default'
          },
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: block.content }]
            }
          ]
        }
      case BLOCK_TYPES.BOOKMARK:
        return {
          type: 'link',
          url: block.attributes.uri || '',
          title: block.attributes.caption || null,
          children: [
            { type: 'text', value: block.content || block.attributes.uri }
          ]
        }
      case BLOCK_TYPES.EQUATION:
        return {
          type: 'math',
          value: block.content
        }
      case BLOCK_TYPES.FILE:
        return {
          type: 'link',
          url: block.attributes.uri || '',
          title: 'File attachment',
          children: [{ type: 'text', value: block.content || 'Attached file' }]
        }
      case BLOCK_TYPES.VIDEO:
        return {
          type: 'html',
          value: `<video src="${block.attributes.uri}" controls></video>`
        }
      default:
        return null
    }
  }
}

/**
 * Read a markdown file and convert it to block structure
 * @param {string} file_path - Path to the markdown file
 * @returns {Object} - The block structure
 */
export async function markdown_file_to_blocks({ file_path }) {
  const markdown_text = await fs.readFile(file_path, 'utf-8')
  return await markdown_to_blocks({ markdown_text, file_path })
}
