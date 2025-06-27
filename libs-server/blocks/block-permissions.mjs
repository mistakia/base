/**
 * Block Permissions System
 *
 * Handles parsing and applying permissions for markdown blocks using
 * companion .blockpermissions files only.
 *
 * Default behavior: all blocks are public
 * Companion file: only specify blocks that need restrictions
 */

import fs from 'fs/promises'
import yaml from 'js-yaml'
import debug from 'debug'

const log = debug('block-permissions')

/**
 * Permission system configuration
 */
export const PERMISSION_CONFIG = {
  companion_file_extension: '.blockpermissions',
  default_permission: 'public',
  redaction_templates: {
    heading: '[REDACTED HEADING]',
    paragraph: '[REDACTED CONTENT]',
    code: '[REDACTED CODE]',
    blockquote: '[REDACTED QUOTE]',
    list: '[REDACTED LIST]',
    list_item: '[REDACTED LIST ITEM]',
    image: '[REDACTED IMAGE]',
    table: '[REDACTED TABLE]',
    table_row: '[REDACTED TABLE ROW]',
    table_cell: '[REDACTED TABLE CELL]',
    default: '[REDACTED CONTENT]'
  }
}

/**
 * Permission levels
 */
export const PERMISSION_LEVELS = {
  PUBLIC: 'public', // Default - accessible to all
  OWNER: 'owner' // Owner only (whitelist approach)
}

/**
 * Extensible block matching system
 * Each matcher takes ({ block, rule }) and returns boolean
 */
export const BLOCK_MATCHERS = {
  blocks: ({ block, rule }) => rule.blocks.includes(block.index),

  block_range: ({ block, rule }) => {
    const [start, end] = rule.block_range
    return block.index >= start && block.index <= end
  },

  block_cids: ({ block, rule }) => rule.block_cids.includes(block.cid),

  block_type: ({ block, rule }) => block.type === rule.block_type,

  heading_level: ({ block, rule }) =>
    block.type === 'heading' && block.attributes?.level === rule.heading_level,

  // Future extensibility examples:
  content_pattern: ({ block, rule }) => {
    if (!rule.content_pattern) return false
    try {
      return new RegExp(rule.content_pattern, 'i').test(block.content)
    } catch (error) {
      log('Invalid regex pattern:', rule.content_pattern, error)
      return false
    }
  },

  position_range: ({ block, rule }) => {
    if (!rule.position_range || !block.metadata?.position) return false
    const { start_line, end_line } = rule.position_range
    const block_line = block.metadata.position.start.line
    return block_line >= start_line && block_line <= end_line
  }
}

/**
 * Parse companion .blockpermissions file
 * @param {string} markdown_file_path - Path to the markdown file
 * @returns {Object|null} Parsed permissions or null if file doesn't exist
 */
export async function parse_companion_permissions({ markdown_file_path }) {
  const permissions_file = `${markdown_file_path}${PERMISSION_CONFIG.companion_file_extension}`

  try {
    const permissions_content = await fs.readFile(permissions_file, 'utf8')
    const parsed = yaml.load(permissions_content)

    log('Found companion permissions:', parsed)
    return parsed
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('Error reading companion permissions file:', error)
    }
    return null
  }
}

/**
 * Apply permissions to block structure by redacting content
 * @param {Object} options - Permission options
 * @param {Object} options.blocks - Block structure from markdown_to_blocks
 * @param {Object} options.companion_permissions - Companion file permissions
 * @param {Object} options.user_context - User context for permission checking
 * @returns {Object} Blocks with redacted content where permissions deny access
 */
export function apply_block_permissions({
  blocks,
  companion_permissions,
  user_context
}) {
  // If no companion permissions file, everything is public
  if (!companion_permissions?.permissions) {
    return { blocks, redacted_count: 0 }
  }

  // Convert blocks object to array for easier processing (excluding document block)
  const block_array = Object.entries(blocks)
    .filter(([cid, block]) => block.type !== 'markdown_file') // Exclude document blocks from permission processing
    .map(([cid, block], index) => ({
      ...block,
      cid, // Keep original cid for reference
      index: index + 1 // 1-based indexing for user-friendly companion files
    }))

  const blocks_to_redact = new Set()

  // Process companion file permissions
  for (const perm_rule of companion_permissions.permissions) {
    const permission_level = perm_rule.allow || 'public'

    if (
      !has_permission({ required_permission: permission_level, user_context })
    ) {
      const matching_blocks = find_matching_blocks({ block_array, perm_rule })

      for (const block of matching_blocks) {
        blocks_to_redact.add(block.cid)
        log(`Redacting block ${block.cid} due to permission rule:`, perm_rule)
      }
    }
  }

  // Create new blocks object with redacted content
  const processed_blocks = {}

  for (const [cid, block] of Object.entries(blocks)) {
    // Deep clone the block to avoid modifying original
    const processed_block = {
      ...block,
      relationships: {
        parent: block.relationships?.parent || '',
        children: Array.isArray(block.relationships?.children)
          ? [...block.relationships.children]
          : [],
        references: Array.isArray(block.relationships?.references)
          ? [...block.relationships.references]
          : []
      }
    }

    // Redact content if block should be redacted
    if (blocks_to_redact.has(cid)) {
      processed_block.content = get_redacted_content(block.type)
      processed_block.is_redacted = true
      processed_block.redaction_reason =
        'Access denied - insufficient permissions'
    }

    processed_blocks[cid] = processed_block
  }

  return {
    blocks: processed_blocks,
    redacted_count: blocks_to_redact.size
  }
}

/**
 * Find blocks matching a permission rule using extensible matcher system
 * @param {Object} options - Matching options
 * @param {Array} options.block_array - Array of blocks with index and cid
 * @param {Object} options.perm_rule - Permission rule from companion file
 * @returns {Array} Array of matching blocks
 */
function find_matching_blocks({ block_array, perm_rule }) {
  const matching_blocks = new Set() // Use Set to avoid duplicates

  // Iterate through all available matchers
  for (const [matcher_name, matcher_fn] of Object.entries(BLOCK_MATCHERS)) {
    // Check if this rule has the matcher property
    if (perm_rule[matcher_name] !== undefined) {
      try {
        // Apply the matcher to all blocks
        for (const block of block_array) {
          if (matcher_fn({ block, rule: perm_rule })) {
            matching_blocks.add(block)
            log(
              `Block ${block.cid} matched by ${matcher_name}:`,
              perm_rule[matcher_name]
            )
          }
        }
      } catch (error) {
        log(`Error in matcher ${matcher_name}:`, error)
      }
    }
  }

  return Array.from(matching_blocks)
}

/**
 * Check if user has required permission
 * @param {Object} options - Permission check options
 * @param {string} options.required_permission - Required permission level
 * @param {Object} options.user_context - User context with permissions
 * @returns {boolean} Whether user has permission
 */
function has_permission({ required_permission, user_context }) {
  // Public content is always accessible
  if (required_permission === PERMISSION_LEVELS.PUBLIC) {
    return true
  }

  // Owner-only content requires ownership (user_id is optional for backward compatibility)
  if (required_permission === PERMISSION_LEVELS.OWNER) {
    return user_context?.is_owner === true
  }

  // Future permission levels can be added here
  log(`Unknown permission level: ${required_permission}`)
  return false
}

/**
 * Get appropriate redacted content for a block type using configuration
 * @param {string} block_type - The type of block to redact
 * @returns {string} Redacted content placeholder
 */
function get_redacted_content(block_type) {
  return (
    PERMISSION_CONFIG.redaction_templates[block_type] ||
    PERMISSION_CONFIG.redaction_templates.default
  )
}

/**
 * Main function to process permissions for a markdown file
 * @param {Object} options - Processing options
 * @param {string} options.file_path - Path to the markdown file
 * @param {Object} options.blocks - Blocks from markdown_to_blocks
 * @param {Object} options.user_context - User context for permission checking
 * @returns {Object} Object with filtered blocks and metadata
 */
export async function process_block_permissions({
  file_path,
  blocks,
  user_context
}) {
  try {
    // Parse companion permissions
    const companion_permissions = await parse_companion_permissions({
      markdown_file_path: file_path
    })

    // Apply permissions and redact blocks
    const permission_result = apply_block_permissions({
      blocks,
      companion_permissions,
      user_context
    })

    const original_count = Object.keys(blocks).length
    const processed_count = Object.keys(permission_result.blocks).length

    return {
      blocks: permission_result.blocks,
      permission_metadata: {
        has_permissions: companion_permissions !== null,
        has_companion_file: companion_permissions !== null,
        blocks_redacted: permission_result.redacted_count,
        original_block_count: original_count,
        processed_block_count: processed_count
      }
    }
  } catch (error) {
    log('Error processing block permissions:', error)
    // Return original blocks if permission processing fails
    return {
      blocks,
      permission_metadata: {
        error: error.message,
        has_permissions: false,
        blocks_redacted: 0
      }
    }
  }
}
