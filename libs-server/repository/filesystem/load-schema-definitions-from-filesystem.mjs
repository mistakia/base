import debug from 'debug'
import path from 'path'
import { list_files_recursive } from './list-files-recursive.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import {
  get_system_base_directory,
  get_user_base_directory
} from '#libs-server/base-uri/index.mjs'

const log = debug('repository:filesystem:load-schemas')

// Schema directory constants
const SYSTEM_SCHEMA_RELATIVE_DIR = 'system/schema'
const USER_SCHEMA_RELATIVE_DIR = 'schema'

/**
 * Load schema definitions from filesystem using optimized direct scanning
 * This avoids scanning the entire user base directory and targets only schema directories
 *
 * @returns {Promise<Object>} - Map of schema definitions by name
 */
export async function load_schema_definitions_from_filesystem() {
  // Get directories from registry
  const system_base_directory = get_system_base_directory()
  const user_base_directory = get_user_base_directory()

  try {
    // Collect all schema files from filesystem using optimized approach
    log('Scanning filesystem for schema files (optimized)')
    const start_time = Date.now()

    const all_entities = []

    // Get schemas from system directory - scan only the schema subdirectory
    if (system_base_directory) {
      const system_schema_dir = path.join(
        system_base_directory,
        SYSTEM_SCHEMA_RELATIVE_DIR
      )
      log(`Scanning system schema directory: ${system_schema_dir}`)
      const system_files = await list_files_recursive({
        directory: system_schema_dir,
        file_extension: '.md',
        absolute_paths: true
      })

      for (const file_path of system_files) {
        try {
          const entity_result = await read_entity_from_filesystem({
            absolute_path: file_path
          })

          if (
            entity_result.success &&
            entity_result.entity_properties?.type === 'type_definition'
          ) {
            all_entities.push({
              entity_properties: entity_result.entity_properties
            })
          }
        } catch (error) {
          log(`Error reading system schema file ${file_path}: ${error.message}`)
        }
      }
      log(`Found ${system_files.length} system schema files`)
    }

    // Get schemas from user directory - scan only the schema subdirectory
    if (user_base_directory) {
      const user_schema_dir = path.join(
        user_base_directory,
        USER_SCHEMA_RELATIVE_DIR
      )
      log(`Scanning user schema directory: ${user_schema_dir}`)
      const user_files = await list_files_recursive({
        directory: user_schema_dir,
        file_extension: '.md',
        absolute_paths: true
      })

      for (const file_path of user_files) {
        try {
          const entity_result = await read_entity_from_filesystem({
            absolute_path: file_path
          })

          if (
            entity_result.success &&
            entity_result.entity_properties?.type === 'type_definition'
          ) {
            all_entities.push({
              entity_properties: entity_result.entity_properties
            })
          }
        } catch (error) {
          log(`Error reading user schema file ${file_path}: ${error.message}`)
        }
      }
      log(`Found ${user_files.length} user schema files`)
    }

    const scan_duration = Date.now() - start_time
    log(`[TIMING] Schema file scanning completed in ${scan_duration}ms`)
    log(`Found ${all_entities.length} schema entities total`)

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
    const extends_start = Date.now()
    log(
      `Applying extends from ${type_definitions_with_extends.length} type definitions`
    )
    for (const definition of type_definitions_with_extends) {
      const entity_type = definition.extends

      if (schema_map[entity_type]) {
        const base_schema = schema_map[entity_type]
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
          inherited_from: entity_type
        }
      } else {
        log(
          `Definition ${definition.title} extends unknown entity type ${entity_type}`
        )
        console.warn(
          `Definition ${definition.title} extends unknown entity type ${entity_type}`
        )
      }
    }

    const extends_duration = Date.now() - extends_start
    log(`[TIMING] Extends processing completed in ${extends_duration}ms`)

    const total_duration = Date.now() - start_time
    log(`[TIMING] Total schema loading completed in ${total_duration}ms`)
    log(`Loaded ${Object.keys(schema_map).length} schema definitions`)
    return schema_map
  } catch (error) {
    log('Error loading schema definitions:', error)
    return {}
  }
}

export default load_schema_definitions_from_filesystem
