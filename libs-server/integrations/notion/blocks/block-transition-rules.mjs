/**
 * Block transition rules for Notion-to-markdown conversion
 * Defines spacing rules between different block types
 */

import debug from 'debug'

const log = debug('integrations:notion:blocks:transition-rules')

/**
 * Block type categories for spacing logic
 */
const BLOCK_CATEGORIES = {
  LIST_ITEM: ['bulleted_list_item', 'numbered_list_item', 'to_do'],
  HEADING: ['heading_1', 'heading_2', 'heading_3'],
  PARAGRAPH: ['paragraph'],
  CODE: ['code'],
  QUOTE: ['quote', 'callout'],
  MEDIA: ['image', 'video', 'file', 'bookmark', 'embed'],
  SPECIAL: ['divider', 'table', 'equation'],
  CONTAINER: ['toggle', 'column_list', 'column'],
  DATABASE: ['child_database'],
  PAGE: ['child_page'],
  OTHER: ['table_of_contents']
}

/**
 * Get category for a block type
 * @param {string} block_type - Notion block type
 * @returns {string} Block category
 */
function get_block_category(block_type) {
  for (const [category, types] of Object.entries(BLOCK_CATEGORIES)) {
    if (types.includes(block_type)) {
      return category
    }
  }
  return 'OTHER'
}

/**
 * Get spacing between block types based on transition rules
 * @param {string} previous_type - Previous block type
 * @param {string} current_type - Current block type
 * @param {number} previous_depth - Previous block nesting depth
 * @param {number} current_depth - Current block nesting depth
 * @param {Object} context - Additional context information
 * @returns {string} Spacing to add between blocks
 */
export function get_block_spacing(
  previous_type,
  current_type,
  previous_depth = 0,
  current_depth = 0,
  context = {}
) {
  // No spacing needed at the start
  if (!previous_type) {
    return ''
  }

  const prev_category = get_block_category(previous_type)
  const curr_category = get_block_category(current_type)

  log(
    `Spacing: ${previous_type}(${prev_category}) → ${current_type}(${curr_category}), depths: ${previous_depth} → ${current_depth}`
  )

  // Special case: Empty paragraph provides intentional spacing
  if (previous_type === 'paragraph' && context.was_empty_paragraph) {
    return '\n' // Extra newline for intentional spacing
  }

  // List item transitions
  if (prev_category === 'LIST_ITEM') {
    // List item → Heading: Add extra spacing
    if (curr_category === 'HEADING') {
      return '\n'
    }

    // List item → Different non-list block: Add spacing
    if (curr_category !== 'LIST_ITEM') {
      return '\n'
    }

    // List item → Same list type with depth change
    if (curr_category === 'LIST_ITEM' && previous_depth !== current_depth) {
      // When transitioning from deeper to shallower depth, add spacing
      if (previous_depth > current_depth) {
        return '\n'
      }
      return '' // No extra spacing for going deeper
    }
  }

  // Heading transitions
  if (prev_category === 'HEADING') {
    // Heading → Anything: Normal spacing (already handled by heading conversion)
    return ''
  }

  // Toggle container transitions
  if (previous_type === 'toggle' && context.toggle_just_closed) {
    // Toggle close → Any block: Add extra spacing
    return '\n'
  }

  // Container transitions
  if (prev_category === 'CONTAINER') {
    if (curr_category !== 'CONTAINER') {
      return '\n'
    }
  }

  // Media/Special block transitions
  if (prev_category === 'MEDIA' || prev_category === 'SPECIAL') {
    if (curr_category === 'HEADING' || curr_category === 'PARAGRAPH') {
      return '' // Normal spacing (these blocks already add double newlines)
    }
  }

  // Code block transitions
  if (prev_category === 'CODE') {
    if (curr_category === 'LIST_ITEM') {
      return '' // Code blocks already add double newlines
    }
  }

  // Quote transitions
  if (prev_category === 'QUOTE') {
    if (curr_category === 'HEADING' || curr_category === 'LIST_ITEM') {
      return '' // Quotes already add spacing
    }
  }

  // Default: No extra spacing
  return ''
}

/**
 * Check if a block represents an empty paragraph for spacing
 * @param {Object} block - Notion block object
 * @returns {boolean} True if this is an empty paragraph
 */
export function is_empty_paragraph(block) {
  return (
    block.type === 'paragraph' &&
    block.paragraph &&
    Array.isArray(block.paragraph.rich_text) &&
    block.paragraph.rich_text.length === 0
  )
}

/**
 * Get context information for spacing decisions
 * @param {Object} block - Current block
 * @param {Object} previous_block - Previous block
 * @param {Array} children - Child blocks if any
 * @returns {Object} Context object for spacing decisions
 */
export function get_spacing_context(block, previous_block, children = []) {
  const context = {}

  // Check if previous block was an empty paragraph
  if (previous_block) {
    context.was_empty_paragraph = is_empty_paragraph(previous_block)
  }

  // Check if toggle just closed
  if (
    previous_block &&
    previous_block.type === 'toggle' &&
    (!children || children.length === 0)
  ) {
    context.toggle_just_closed = true
  }

  return context
}

/**
 * Normalize excessive spacing while preserving intentional gaps
 * @param {string} markdown - Markdown content
 * @returns {string} Normalized markdown
 */
export function normalize_spacing(markdown) {
  // Replace 4+ consecutive newlines with max 3 (preserves intentional double spacing)
  return markdown.replace(/\n{4,}/g, '\n\n\n')
}
