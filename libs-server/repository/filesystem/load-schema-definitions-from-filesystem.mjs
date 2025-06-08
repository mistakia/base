import debug from 'debug'
import { list_entity_files_from_filesystem } from './list-entity-files-from-filesystem.mjs'
import {
  get_system_base_directory,
  get_user_base_directory
} from '#libs-server/base-uri/index.mjs'

const log = debug('repository:filesystem:load-schemas')

// Schema directory constants
const SYSTEM_SCHEMA_RELATIVE_DIR = 'system/schema'
const USER_SCHEMA_RELATIVE_DIR = 'schema'

/**
 * Load schema definitions from filesystem using registry system
 *
 * @returns {Promise<Object>} - Map of schema definitions by name
 */
export async function load_schema_definitions_from_filesystem() {
  // Get directories from registry
  const system_base_directory = get_system_base_directory()
  const user_base_directory = get_user_base_directory()

  try {
    // Collect all schema files from filesystem
    log('Scanning filesystem for schema files')

    // Get schemas from root directory
    const root_entities = await list_entity_files_from_filesystem({
      base_directory: system_base_directory,
      include_entity_types: ['type_definition'],
      path_pattern: `${SYSTEM_SCHEMA_RELATIVE_DIR}/*.md`
    })

    // Get schemas from user directory
    const user_entities = await list_entity_files_from_filesystem({
      base_directory: user_base_directory,
      include_entity_types: ['type_definition'],
      path_pattern: `${USER_SCHEMA_RELATIVE_DIR}/*.md`
    })

    // Combine entities from both directories
    const all_entities = [...root_entities, ...user_entities]
    log(`Found ${all_entities.length} schema entities`)

    // Process schema files
    const schema_map = {}
    const type_definitions_with_extends = []

    for (const entity_result of all_entities) {
      const entity = entity_result.entity_properties

      if (entity.type === 'type_definition') {
        schema_map[entity.type_name] = {
          ...entity
        }

        // Check if this type definition extends another type
        if (entity.extends) {
          type_definitions_with_extends.push(entity)
        }
      }
    }

    // Apply 'extends' property from type_definition files
    log(
      `Applying extends from ${type_definitions_with_extends.length} type definitions`
    )
    for (const definition of type_definitions_with_extends) {
      const base_type = definition.extends

      if (schema_map[base_type]) {
        const base_schema = schema_map[base_type]
        const extending_schema = schema_map[definition.type_name]

        // Merge base properties into extending schema
        // Ensure properties remain in array format
        const base_properties = Array.isArray(base_schema.properties)
          ? base_schema.properties
          : []

        const extending_properties = Array.isArray(extending_schema.properties)
          ? extending_schema.properties
          : []

        // Create a map of property names for faster lookups
        const property_map = {}
        extending_properties.forEach((prop) => {
          if (prop && prop.name) {
            property_map[prop.name] = true
          }
        })

        // Filter out base properties that are already defined in the extending schema
        const filtered_base_properties = base_properties.filter((prop) => {
          return prop && prop.name && !property_map[prop.name]
        })

        // Combine properties, putting base properties first
        const combined_properties = [
          ...filtered_base_properties,
          ...extending_properties
        ]

        schema_map[definition.type_name] = {
          ...extending_schema,
          properties: combined_properties,
          // Track inheritance
          inherited_from: base_type
        }
      } else {
        log(
          `Definition ${definition.title} extends unknown base type ${base_type}`
        )
        console.warn(
          `Definition ${definition.title} extends unknown base type ${base_type}`
        )
      }
    }

    log(`Loaded ${Object.keys(schema_map).length} schema definitions`)
    return schema_map
  } catch (error) {
    log('Error loading schema definitions:', error)
    return {}
  }
}

export default load_schema_definitions_from_filesystem
