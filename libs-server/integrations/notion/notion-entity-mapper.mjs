/**
 * Notion Entity Mapper
 *
 * Configuration-driven property mapping system for converting between
 * Notion properties and Base entity properties
 */

import debug from 'debug'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

const log = debug('integrations:notion:entity-mapper')

// Cache for mapping configuration
let _mapping_config = null
let _cached_user_base_directory = null

// Get path to user-base notion entity mappings configuration
function get_notion_entity_mappings_path() {
  return resolve(
    get_user_base_directory(),
    'config/notion-entity-mappings.json'
  )
}

/**
 * Load mapping configuration from file
 * @returns {Object} Mapping configuration
 */
function load_mapping_config() {
  const current_user_base_directory = get_user_base_directory()

  // Invalidate cache if user base directory has changed
  if (_cached_user_base_directory !== current_user_base_directory) {
    _mapping_config = null
    _cached_user_base_directory = current_user_base_directory
  }

  if (_mapping_config) {
    return _mapping_config
  }

  try {
    const mappings_path = get_notion_entity_mappings_path()
    const config_content = readFileSync(mappings_path, 'utf8')
    _mapping_config = JSON.parse(config_content)
    log(`Loaded Notion entity mappings configuration from ${mappings_path}`)
    return _mapping_config
  } catch (error) {
    log(
      `Failed to load mapping config from ${get_notion_entity_mappings_path()}: ${error.message}`
    )

    // Return default configuration
    _mapping_config = {
      databases: {}
    }

    log('Using default mapping configuration')
    return _mapping_config
  }
}

/**
 * Get mapping configuration for a database
 * @param {string} database_id - The Notion database ID
 * @returns {Object|null} Mapping configuration or null if not found
 */
export function get_database_mapping_config(database_id) {
  const config = load_mapping_config()
  return config.databases?.[database_id] || null
}

/**
 * Get entity type for a database ID
 * @param {string} database_id - The Notion database ID
 * @returns {string|null} Entity type or null if not found
 */
export function get_entity_type_for_database(database_id) {
  const mapping = get_database_mapping_config(database_id)
  return mapping?.entity_type || null
}

/**
 * Get conversion rules from mapping configuration
 * @returns {Object} Conversion rules
 */
export function get_conversion_rules() {
  const config = load_mapping_config()
  return config?.conversion_rules || {}
}

/**
 * Get all configured database IDs
 * @returns {Array} Array of database IDs
 */
export function get_configured_database_ids() {
  const config = load_mapping_config()
  return config.databases ? Object.keys(config.databases) : []
}

/**
 * Get database name for a database ID
 * @param {string} database_id - The Notion database ID
 * @returns {string|null} Database name or null if not found
 */
export function get_database_name(database_id) {
  const mapping = get_database_mapping_config(database_id)
  return mapping?.name || null
}

/**
 * Get target directory for a database ID
 * @param {string} database_id - The Notion database ID
 * @returns {string|null} Target directory path relative to user base root, or null if not configured
 */
export function get_target_directory_for_database(database_id) {
  const mapping = get_database_mapping_config(database_id)
  return mapping?.target_directory || null
}
