/**
 * Block System Module
 *
 * A content-addressable block-based system for working with markdown documents
 * using PostgreSQL as the storage backend
 */

// Export block schemas and types
export {
  // Block type definitions
  BLOCK_TYPES,
  // Base block schema
  BASE_BLOCK,
  // Block type schemas
  MARKDOWN_FILE_BLOCK,
  HEADING_BLOCK,
  PARAGRAPH_BLOCK,
  LIST_BLOCK,
  LIST_ITEM_BLOCK,
  CODE_BLOCK,
  BLOCKQUOTE_BLOCK,
  THEMATIC_BREAK_BLOCK,
  IMAGE_BLOCK,
  HTML_BLOCK,
  // Block creation helper
  create_block
} from './block-schemas.mjs'

// Export from converter module
export {
  markdown_to_blocks,
  blocks_to_markdown,
  markdown_file_to_blocks,
  compute_cid
} from './block-converter.mjs'

// Export from block operations module
export {
  import_file,
  export_file,
  search_blocks,
  show_block
} from './block-operations.mjs'
