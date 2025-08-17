import debug from 'debug'
import { list_entity_files_from_git } from './list-entity-files-from-git.mjs'
import {
  get_system_base_directory,
  get_user_base_directory
} from '#libs-server/base-uri/index.mjs'

const log = debug('repository:git:load-schemas')

// Schema directory constants
const SYSTEM_SCHEMA_GIT_RELATIVE_DIR = 'system/schema'
const USER_SCHEMA_GIT_RELATIVE_DIR = 'schema'

/**
 * Load schema definitions from git repositories using registry system
 *
 * @returns {Promise<Object>} - Map of schema definitions by name
 */
export async function load_schema_definitions_from_git() {
  // Get directories from registry
  const system_base_directory = get_system_base_directory()
  const user_base_directory = get_user_base_directory()

  try {
    // Collect all schema files from repositories
    log('Scanning repositories for schema files')

    // Get schemas from root repository
    const root_entities = await list_entity_files_from_git({
      repo_path: system_base_directory,
      branch: 'main',
      include_entity_types: ['type_definition'],
      path_pattern: `${SYSTEM_SCHEMA_GIT_RELATIVE_DIR}/*.md`,
      is_system_repo: true
    })

    // Get schemas from user repository
    const user_entities = await list_entity_files_from_git({
      repo_path: user_base_directory,
      branch: 'main',
      include_entity_types: ['type_definition'],
      path_pattern: `${USER_SCHEMA_GIT_RELATIVE_DIR}/*.md`
    })

    // Combine entities from both repositories
    const all_entities = [...root_entities, ...user_entities]
    log(`Found ${all_entities.length} schema entities`)

    // Process schema files
    const schema_map = {}
    const type_definitions_with_extends = []

    for (const entity_result of all_entities) {
      const entity = entity_result.entity_properties

      if (entity.type === 'type_definition') {
        schema_map[entity.type_name] = {
          ...entity,
          git_relative_path: entity_result.file_info.git_relative_path
        }

        // Check if this type definition extends another type
        if (entity.extends) {
          type_definitions_with_extends.push({
            ...entity,
            git_relative_path: entity_result.file_info.git_relative_path
          })
        }
      }
    }

    // Apply 'extends' property from type_definition files
    log(
      `Applying extends from ${type_definitions_with_extends.length} type definitions`
    )
    for (const definition of type_definitions_with_extends) {
      const entity_type = definition.extends

      if (schema_map[entity_type]) {
        const base_schema = schema_map[entity_type]
        const extending_schema = schema_map[definition.type_name]

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

        // Merge base properties into extending schema
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

    log(`Loaded ${Object.keys(schema_map).length} schema definitions`)
    return schema_map
  } catch (error) {
    log('Error loading schema definitions:', error)
    return {}
  }
}

export default load_schema_definitions_from_git
