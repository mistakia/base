/**
 * Block System Module
 *
 * Markdown processing utilities and block schemas.
 * Database-dependent components removed in favor of file-first architecture.
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

// Export block converter utilities
export {
  // Markdown conversion functions
  markdown_to_blocks,
  blocks_to_markdown,
  markdown_file_to_blocks,
  // Content identifier utilities
  compute_cid,
  // AST building utilities
  build_ast_from_blocks
} from './block-converter.mjs'
