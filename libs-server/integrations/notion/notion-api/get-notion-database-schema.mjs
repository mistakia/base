/**
 * Get Notion database schema and property definitions
 */

import debug from 'debug'
import { get_notion_client, clean_notion_id } from './create-notion-client.mjs'

const log = debug('integrations:notion:api:get-database-schema')

/**
 * Get database schema with property definitions
 * @param {string} database_id - The ID of the database
 * @returns {Object} Database schema with properties
 */
export async function get_notion_database_schema(database_id) {
  const notion = get_notion_client()
  if (!notion) {
    throw new Error('Notion client not available - check API key configuration')
  }

  try {
    const clean_id = clean_notion_id(database_id)
    log(`Retrieving database schema: ${clean_id}`)

    const database = await notion.databases.retrieve({ database_id: clean_id })

    const schema = {
      id: database.id,
      title: database.title,
      description: database.description,
      properties: database.properties,
      created_time: database.created_time,
      last_edited_time: database.last_edited_time,
      url: database.url
    }

    log(
      `Retrieved schema for database: ${database.title?.[0]?.plain_text || clean_id}`
    )
    return schema
  } catch (error) {
    log(`Failed to retrieve database schema: ${error.message}`)
    throw new Error(`Failed to get Notion database schema: ${error.message}`)
  }
}

/**
 * Get property type mapping for a database
 * @param {string} database_id - The ID of the database
 * @returns {Object} Mapping of property names to types
 */
export async function get_notion_database_property_types(database_id) {
  const schema = await get_notion_database_schema(database_id)
  const property_types = {}

  for (const [name, property] of Object.entries(schema.properties)) {
    property_types[name] = {
      type: property.type,
      id: property.id,
      name: property.name || name
    }

    // Include additional type-specific information
    if (property.type === 'select' && property.select?.options) {
      property_types[name].options = property.select.options
    } else if (
      property.type === 'multi_select' &&
      property.multi_select?.options
    ) {
      property_types[name].options = property.multi_select.options
    } else if (property.type === 'relation' && property.relation?.database_id) {
      property_types[name].database_id = property.relation.database_id
    }
  }

  return property_types
}

/**
 * Validate properties against database schema
 * @param {string} database_id - The ID of the database
 * @param {Object} properties - Properties to validate
 * @returns {Object} Validation result with errors
 */
export async function validate_properties_against_schema(
  database_id,
  properties
) {
  const property_types = await get_notion_database_property_types(database_id)
  const validation_result = {
    valid: true,
    errors: [],
    warnings: []
  }

  for (const [prop_name, prop_value] of Object.entries(properties)) {
    const schema_property = property_types[prop_name]

    if (!schema_property) {
      validation_result.warnings.push(
        `Property '${prop_name}' not found in database schema`
      )
      continue
    }

    // Basic type validation - this could be expanded for more thorough validation
    if (prop_value && typeof prop_value === 'object') {
      const value_type = Object.keys(prop_value)[0]
      if (value_type !== schema_property.type) {
        validation_result.valid = false
        validation_result.errors.push(
          `Property '${prop_name}' type mismatch: expected '${schema_property.type}', got '${value_type}'`
        )
      }
    }
  }

  return validation_result
}
