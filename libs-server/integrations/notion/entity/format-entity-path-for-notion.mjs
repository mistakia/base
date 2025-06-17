/**
 * Format entity file path for Notion-synced entities
 */

import debug from 'debug'

const log = debug('integrations:notion:entity:format-path')

/**
 * Sanitize a string for use in file paths
 * @param {string} input - Input string
 * @returns {string} Sanitized string safe for file paths
 */
function sanitize_for_filename(input) {
  if (!input || typeof input !== 'string') {
    return 'untitled'
  }

  return input
    .toLowerCase()
    .trim()
    // Remove or replace special characters
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/[^\w\s-]/g, '') // Keep only word characters, spaces, and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove multiple consecutive hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 100) || // Limit length
    'untitled' // Fallback if string becomes empty
}

/**
 * Get directory name for entity type
 * @param {string} entity_type - The entity type
 * @returns {string} Directory name
 */
function get_directory_for_entity_type(entity_type) {
  // Convert entity type to directory name format
  switch (entity_type) {
    case 'physical_item':
      return 'physical-item'
    case 'digital_item':
      return 'digital-item'
    case 'physical_location':
      return 'physical-location'
    case 'database_table':
      return 'database-table'
    case 'database_view':
      return 'database-view'
    default:
      // For most types, just replace underscores with hyphens
      return entity_type.replace(/_/g, '-')
  }
}

/**
 * Generate a unique filename if there's a conflict
 * @param {string} base_path - Base file path
 * @param {string} entity_id - Entity ID for uniqueness
 * @returns {string} Unique file path
 */
function make_unique_filename(base_path, entity_id) {
  const parts = base_path.split('/')
  const filename = parts[parts.length - 1]
  const name_without_ext = filename.replace('.md', '')

  // Add first 8 characters of entity ID for uniqueness
  const unique_suffix = entity_id.substring(0, 8)
  const unique_name = `${name_without_ext}-${unique_suffix}.md`

  parts[parts.length - 1] = unique_name
  return parts.join('/')
}

/**
 * Format entity file path for Notion-synced entities
 * @param {Object} entity - Entity object
 * @param {Object} options - Formatting options
 * @returns {string} File path for the entity
 */
export function format_entity_path_for_notion(entity, options = {}) {
  try {
    const {
      ensure_unique = true,
      max_filename_length = 80,
      include_notion_prefix = false
    } = options

    // Get directory based on entity type
    const directory = get_directory_for_entity_type(entity.type)

    // Sanitize entity name for filename
    let filename = sanitize_for_filename(entity.name)

    // Truncate if too long
    if (filename.length > max_filename_length) {
      filename = filename.substring(0, max_filename_length)
      // Remove trailing hyphen if created by truncation
      filename = filename.replace(/-+$/, '')
    }

    // Add Notion prefix if requested
    if (include_notion_prefix) {
      filename = `notion-${filename}`
    }

    // Construct base path
    let file_path = `${directory}/${filename}.md`

    // Make unique if requested and entity has ID
    if (ensure_unique && entity.entity_id) {
      // Check if the name already seems unique (contains ID-like string)
      if (!filename.match(/[a-f0-9]{8}/)) {
        file_path = make_unique_filename(file_path, entity.entity_id)
      }
    }

    log(`Formatted entity path: ${entity.type} "${entity.name}" → ${file_path}`)
    return file_path
  } catch (error) {
    log(`Error formatting entity path: ${error.message}`)

    // Fallback to a safe default path
    const directory = get_directory_for_entity_type(entity.type || 'text')
    const fallback_name = entity.entity_id
      ? `entity-${entity.entity_id.substring(0, 8)}`
      : `entity-${Date.now()}`

    return `${directory}/${fallback_name}.md`
  }
}

/**
 * Format path specifically for Notion database items
 * @param {Object} entity - Entity object
 * @param {string} database_id - Notion database ID
 * @param {Object} options - Formatting options
 * @returns {string} File path for the database item entity
 */
export function format_database_item_path(entity, database_id, options = {}) {
  const { include_database_info = false } = options

  const format_options = { ...options }

  if (include_database_info) {
    // Include database info in the path or filename
    format_options.include_notion_prefix = true

    // Could also create database-specific subdirectories
    // This would require mapping database IDs to meaningful names
  }

  return format_entity_path_for_notion(entity, format_options)
}

/**
 * Get suggested file path without committing to it
 * @param {Object} entity - Entity object
 * @param {Object} options - Formatting options
 * @returns {Object} Path suggestions and metadata
 */
export function suggest_entity_path_for_notion(entity, options = {}) {
  const primary_path = format_entity_path_for_notion(entity, options)

  // Generate alternative paths
  const alternatives = []

  // Alternative with Notion prefix
  if (!options.include_notion_prefix) {
    alternatives.push(format_entity_path_for_notion(entity, {
      ...options,
      include_notion_prefix: true
    }))
  }

  // Alternative with entity ID
  if (!options.ensure_unique) {
    alternatives.push(format_entity_path_for_notion(entity, {
      ...options,
      ensure_unique: true
    }))
  }

  return {
    primary: primary_path,
    alternatives,
    directory: get_directory_for_entity_type(entity.type),
    filename: primary_path.split('/').pop(),
    metadata: {
      entity_type: entity.type,
      entity_name: entity.name,
      sanitized_name: sanitize_for_filename(entity.name)
    }
  }
}
