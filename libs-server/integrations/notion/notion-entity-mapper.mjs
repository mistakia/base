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
 * Get database mapping config from entity's notion_database_id property
 * @param {Object} entity - Entity object with notion_database_id in frontmatter
 * @returns {Object|null} Database mapping config or null if not found
 */
export function get_database_mapping_config_from_entity(entity) {
  if (!entity.notion_database_id) {
    return null
  }

  return get_database_mapping_config(entity.notion_database_id)
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
 * Convert entity property to Notion property format
 * @param {string} database_id - The Notion database ID
 * @param {string} entity_field - The entity field name
 * @param {any} value - The value to convert
 * @returns {Object} Notion property object
 */
export function convert_entity_property_to_notion(
  database_id,
  entity_field,
  value
) {
  const mapping = get_database_mapping_config(database_id)
  if (!mapping || !mapping.property_mappings[entity_field]) {
    return null
  }

  const notion_property_name = mapping.property_mappings[entity_field]
  const conversion_type = mapping.type_conversions?.[notion_property_name]

  // Apply type conversion based on configuration
  switch (conversion_type) {
    case 'select_to_priority':
    case 'select_to_usage_frequency':
      return {
        [notion_property_name]: {
          select: value ? { name: value } : null
        }
      }

    case 'select_to_boolean':
      return {
        [notion_property_name]: {
          select: { name: value ? 'True' : 'False' }
        }
      }

    case 'rich_text':
      return {
        [notion_property_name]: {
          rich_text: [
            {
              type: 'text',
              text: { content: String(value || '') }
            }
          ]
        }
      }

    case 'number':
      return {
        [notion_property_name]: {
          number: typeof value === 'number' ? value : parseFloat(value) || null
        }
      }

    case 'url':
      return {
        [notion_property_name]: {
          url: value || null
        }
      }

    default:
      // Default conversion based on value type
      if (typeof value === 'string') {
        return {
          [notion_property_name]: {
            rich_text: [
              {
                type: 'text',
                text: { content: value }
              }
            ]
          }
        }
      } else if (typeof value === 'number') {
        return {
          [notion_property_name]: {
            number: value
          }
        }
      } else if (typeof value === 'boolean') {
        return {
          [notion_property_name]: {
            checkbox: value
          }
        }
      }

      return null
  }
}

/**
 * Convert multiple entity properties to Notion properties format
 * @param {string} database_id - The Notion database ID
 * @param {Object} entity_data - Entity data object
 * @returns {Object} Notion properties object
 */
export function convert_entity_to_notion_properties(database_id, entity_data) {
  const mapping = get_database_mapping_config(database_id)
  if (!mapping) {
    throw new Error(
      `No mapping configuration found for database: ${database_id}`
    )
  }

  const notion_properties = {}

  for (const [entity_field] of Object.entries(mapping.property_mappings)) {
    if (entity_data[entity_field] !== undefined) {
      const converted_property = convert_entity_property_to_notion(
        database_id,
        entity_field,
        entity_data[entity_field]
      )

      if (converted_property) {
        Object.assign(notion_properties, converted_property)
      }
    }
  }

  return notion_properties
}

/**
 * Convert entity properties to Notion properties using entity's notion_database_id
 * @param {Object} entity - Entity with notion_database_id property
 * @returns {Object} Notion properties object
 */
export function convert_entity_to_notion_properties_from_entity(entity) {
  if (!entity.notion_database_id) {
    throw new Error(
      `Entity ${entity.entity_id} does not have notion_database_id property`
    )
  }

  return convert_entity_to_notion_properties(entity.notion_database_id, entity)
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
