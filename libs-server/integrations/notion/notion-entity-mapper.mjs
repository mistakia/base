/**
 * Notion Entity Mapper
 *
 * Configuration-driven property mapping system for converting between
 * Notion properties and Base entity properties
 */

import debug from 'debug'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const log = debug('integrations:notion:entity-mapper')

// Get the directory path for loading configuration files
const current_file_path = fileURLToPath(import.meta.url)
const current_dir = dirname(current_file_path)
const config_path = join(current_dir, '../../../../config/notion-entity-mappings.json')

let _mapping_config = null

/**
 * Load mapping configuration from file
 * @returns {Object} Mapping configuration
 */
function load_mapping_config() {
  if (_mapping_config) {
    return _mapping_config
  }

  try {
    const config_content = readFileSync(config_path, 'utf8')
    _mapping_config = JSON.parse(config_content)
    log('Loaded Notion entity mappings configuration')
    return _mapping_config
  } catch (error) {
    log(`Failed to load mapping config: ${error.message}`)

    // Return default configuration for physical_item
    _mapping_config = {
      physical_item: {
        database_id: '7078f88d-0299-4f7a-a375-98c759d83f8e',
        entity_type: 'physical_item',
        property_mappings: {
          name: 'item_name',
          manufacturer: 'manufactured_name',
          content: 'misc_notes',
          priority: 'importance',
          quantity: 'current quantity',
          target_quantity: 'target quantity',
          reference_url: 'link',
          location: 'current_location',
          usage_frequency: 'frequency_of_use',
          status: 'exist'
        },
        type_conversions: {
          importance: 'select_to_priority',
          frequency_of_use: 'select_to_usage_frequency',
          exist: 'select_to_boolean'
        }
      }
    }

    log('Using default mapping configuration')
    return _mapping_config
  }
}

/**
 * Get mapping configuration for an entity type
 * @param {string} entity_type - The entity type to get mapping for
 * @returns {Object|null} Mapping configuration or null if not found
 */
export function get_entity_mapping_config(entity_type) {
  const config = load_mapping_config()
  return config[entity_type] || null
}

/**
 * Get entity type for a database ID
 * @param {string} database_id - The Notion database ID
 * @returns {string|null} Entity type or null if not found
 */
export function get_entity_type_for_database(database_id) {
  const config = load_mapping_config()

  for (const [entity_type, mapping] of Object.entries(config)) {
    if (mapping.database_id === database_id) {
      return entity_type
    }
  }

  return null
}

/**
 * Get database ID for an entity type
 * @param {string} entity_type - The entity type
 * @returns {string|null} Database ID or null if not found
 */
export function get_database_id_for_entity_type(entity_type) {
  const mapping = get_entity_mapping_config(entity_type)
  return mapping?.database_id || null
}

/**
 * Convert entity property to Notion property format
 * @param {string} entity_type - The entity type
 * @param {string} entity_field - The entity field name
 * @param {any} value - The value to convert
 * @returns {Object} Notion property object
 */
export function convert_entity_property_to_notion(entity_type, entity_field, value) {
  const mapping = get_entity_mapping_config(entity_type)
  if (!mapping || !mapping.property_mappings[entity_field]) {
    return null
  }

  const notion_property_name = mapping.property_mappings[entity_field]
  const conversion_type = mapping.type_conversions?.[notion_property_name]

  // Apply type conversion based on configuration
  switch (conversion_type) {
    case 'select_to_priority':
      return {
        [notion_property_name]: {
          select: value ? { name: value } : null
        }
      }

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
 * @param {string} entity_type - The entity type
 * @param {Object} entity_data - Entity data object
 * @returns {Object} Notion properties object
 */
export function convert_entity_to_notion_properties(entity_type, entity_data) {
  const mapping = get_entity_mapping_config(entity_type)
  if (!mapping) {
    throw new Error(`No mapping configuration found for entity type: ${entity_type}`)
  }

  const notion_properties = {}

  for (const [entity_field] of Object.entries(mapping.property_mappings)) {
    if (entity_data[entity_field] !== undefined) {
      const converted_property = convert_entity_property_to_notion(
        entity_type,
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
 * Get all configured entity types
 * @returns {Array} Array of entity type names
 */
export function get_configured_entity_types() {
  const config = load_mapping_config()
  return Object.keys(config)
}

/**
 * Get all configured database IDs
 * @returns {Array} Array of database IDs
 */
export function get_configured_database_ids() {
  const config = load_mapping_config()
  return Object.values(config).map(mapping => mapping.database_id)
}
