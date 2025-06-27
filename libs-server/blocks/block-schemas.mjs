/**
 * Block Types
 *
 * This module centralizes all block-related type definitions and constants
 * used throughout the block system.
 */

/**
 * Block Schemas
 *
 * This module defines the structure and validation schemas for all block types
 * in the block system. Each block type has a specific schema that defines its
 * required fields and relationships.
 */

/**
 * Block Types Enum
 */
export const BLOCK_TYPES = {
  MARKDOWN_FILE: 'markdown_file',
  HEADING: 'heading',
  PARAGRAPH: 'paragraph',
  LIST: 'list',
  LIST_ITEM: 'list_item',
  CODE: 'code',
  BLOCKQUOTE: 'blockquote',
  TABLE: 'table',
  TABLE_ROW: 'table_row',
  TABLE_CELL: 'table_cell',
  IMAGE: 'image',
  THEMATIC_BREAK: 'thematic_break',
  CALLOUT: 'callout',
  BOOKMARK: 'bookmark',
  EQUATION: 'equation',
  FILE: 'file',
  VIDEO: 'video',
  HTML_BLOCK: 'html_block'
}

/**
 * Base Block Schema
 * Common fields that all blocks must have
 */
export const BASE_BLOCK = {
  block_cid: '', // Content ID (multihash)
  type: '', // Type of block from BLOCK_TYPES
  content: '', // Raw content
  metadata: {
    // Additional metadata
    created_at: null, // Creation timestamp
    updated_at: null, // Last update timestamp
    user_id: null, // Owner of the block
    tags: [], // Optional tags
    position: {
      // Position in source document
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 }
    }
  },
  attributes: {}, // Block-specific attributes
  relationships: {
    // Relationships to other blocks
    parent: null, // Parent block CID
    children: [], // Child block CIDs
    references: [] // Referenced block CIDs
  }
}

/**
 * Document Block Schema
 * Root level document that contains other blocks
 */
export const MARKDOWN_FILE_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.MARKDOWN_FILE,
  attributes: {
    title: '', // Document title
    source_path: '' // Path to the source file
  }
}

/**
 * Heading Block Schema
 */
export const HEADING_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.HEADING,
  attributes: {
    level: 1, // Heading level (1-6)
    is_toggleable: false // Whether heading is toggleable
  }
}

/**
 * Paragraph Block Schema
 */
export const PARAGRAPH_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.PARAGRAPH,
  attributes: {
    color: 'default' // Text color
  }
}

/**
 * List Block Schema
 */
export const LIST_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.LIST,
  attributes: {
    ordered: false, // Whether list is ordered (numbered) or unordered
    spread: false, // Whether list items contain multiple paragraphs
    color: 'default' // List color
  }
}

/**
 * List Item Block Schema
 */
export const LIST_ITEM_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.LIST_ITEM,
  attributes: {
    indent_level: 0, // Indentation level
    list_type: 'bullet', // bullet, numbered, or task
    checked: false, // For task lists: true = checked, false = unchecked
    color: 'default' // Text color
  }
}

/**
 * Code Block Schema
 */
export const CODE_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.CODE,
  attributes: {
    language: '' // Programming language
  }
}

/**
 * Blockquote Block Schema
 */
export const BLOCKQUOTE_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.BLOCKQUOTE,
  attributes: {
    color: 'default' // Quote color
  }
}

/**
 * Table Block Schema
 */
export const TABLE_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.TABLE,
  attributes: {
    table_width: 1, // Number of columns
    has_column_header: false, // Whether table has column headers
    has_row_header: false // Whether table has row headers
  }
}

/**
 * Table Row Block Schema
 */
export const TABLE_ROW_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.TABLE_ROW,
  attributes: {
    cells: [] // Array of rich text arrays
  }
}

/**
 * Table Cell Block Schema
 */
export const TABLE_CELL_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.TABLE_CELL
}

/**
 * Thematic Break Block Schema
 */
export const THEMATIC_BREAK_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.THEMATIC_BREAK
}

/**
 * Image Block Schema
 */
export const IMAGE_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.IMAGE,
  attributes: {
    uri: '', // Image URI
    alt_text: '', // Alternative text
    caption: '', // Image caption
    type: 'file' // file or external
  }
}

/**
 * HTML Block Schema
 */
export const HTML_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.HTML_BLOCK
}

/**
 * Callout Block Schema
 */
export const CALLOUT_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.CALLOUT,
  attributes: {
    icon: '', // Callout icon
    color: 'default' // Callout color
  }
}

/**
 * Bookmark Block Schema
 */
export const BOOKMARK_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.BOOKMARK,
  attributes: {
    uri: '', // Bookmark URI
    caption: '' // Bookmark caption
  }
}

/**
 * Equation Block Schema
 */
export const EQUATION_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.EQUATION
}

/**
 * File Block Schema
 */
export const FILE_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.FILE,
  attributes: {
    uri: '', // File URI
    type: 'file' // file or external
  }
}

/**
 * Video Block Schema
 */
export const VIDEO_BLOCK = {
  ...BASE_BLOCK,
  type: BLOCK_TYPES.VIDEO,
  attributes: {
    uri: '', // Video URI
    type: 'file' // file or external
  }
}

/**
 * Create a new block instance
 */
export function create_block({
  type,
  content = '',
  metadata = {},
  attributes = {},
  relationships = {}
}) {
  const base = { ...BASE_BLOCK }
  const now = new Date().toISOString()

  base.metadata.created_at = now
  base.metadata.updated_at = now

  // Helper to merge block schema with provided data
  const merge_block_data = (block_schema) => ({
    ...base,
    ...block_schema,
    content,
    metadata: { ...(block_schema.metadata || base.metadata), ...metadata },
    attributes: { ...(block_schema.attributes || {}), ...attributes },
    relationships: {
      ...base.relationships,
      ...relationships,
      // Ensure arrays are properly deep-copied to prevent shared references
      children: [
        ...(relationships.children || base.relationships.children || [])
      ],
      references: [
        ...(relationships.references || base.relationships.references || [])
      ]
    }
  })

  switch (type) {
    case BLOCK_TYPES.MARKDOWN_FILE:
      return merge_block_data(MARKDOWN_FILE_BLOCK)
    case BLOCK_TYPES.HEADING:
      return merge_block_data(HEADING_BLOCK)
    case BLOCK_TYPES.PARAGRAPH:
      return merge_block_data(PARAGRAPH_BLOCK)
    case BLOCK_TYPES.LIST:
      return merge_block_data(LIST_BLOCK)
    case BLOCK_TYPES.LIST_ITEM:
      return merge_block_data(LIST_ITEM_BLOCK)
    case BLOCK_TYPES.CODE:
      return merge_block_data(CODE_BLOCK)
    case BLOCK_TYPES.BLOCKQUOTE:
      return merge_block_data(BLOCKQUOTE_BLOCK)
    case BLOCK_TYPES.TABLE:
      return merge_block_data(TABLE_BLOCK)
    case BLOCK_TYPES.TABLE_ROW:
      return merge_block_data(TABLE_ROW_BLOCK)
    case BLOCK_TYPES.TABLE_CELL:
      return merge_block_data(TABLE_CELL_BLOCK)
    case BLOCK_TYPES.THEMATIC_BREAK:
      return merge_block_data(THEMATIC_BREAK_BLOCK)
    case BLOCK_TYPES.IMAGE:
      return merge_block_data(IMAGE_BLOCK)
    case BLOCK_TYPES.CALLOUT:
      return merge_block_data(CALLOUT_BLOCK)
    case BLOCK_TYPES.BOOKMARK:
      return merge_block_data(BOOKMARK_BLOCK)
    case BLOCK_TYPES.EQUATION:
      return merge_block_data(EQUATION_BLOCK)
    case BLOCK_TYPES.FILE:
      return merge_block_data(FILE_BLOCK)
    case BLOCK_TYPES.VIDEO:
      return merge_block_data(VIDEO_BLOCK)
    case BLOCK_TYPES.HTML_BLOCK:
      return merge_block_data(HTML_BLOCK)
    default:
      return merge_block_data({ type })
  }
}
