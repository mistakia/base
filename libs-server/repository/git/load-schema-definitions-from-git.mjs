import debug from 'debug'
import { list_entity_files_from_git } from './list-entity-files-from-git.mjs'

const log = debug('repository:git:load-schemas')

// Schema directory constants
const SYSTEM_SCHEMA_GIT_RELATIVE_DIR = 'system/schema'
const USER_SCHEMA_GIT_RELATIVE_DIR = 'schema'

/**
 * Load schema definitions from git repositories
 *
 * @param {Object} options - Options for loading schemas
 * @param {Object} options.root_base_directory - Root base directory
 * @param {Object} options.user_base_directory - User base directory
 * @returns {Promise<Object>} - Map of schema definitions by name
 */
export async function load_schema_definitions_from_git({
  root_base_directory,
  user_base_directory
} = {}) {
  // Validate input
  if (!root_base_directory) {
    throw new Error('root_base_directory is required')
  }

  if (!user_base_directory) {
    throw new Error('user_base_directory is required')
  }

  try {
    // Collect all schema files from repositories
    log('Scanning repositories for schema files')

    // Get schemas from root repository
    const root_entities = await list_entity_files_from_git({
      repo_path: root_base_directory,
      branch: 'main',
      include_entity_types: ['type_definition', 'type_extension'],
      path_pattern: `${SYSTEM_SCHEMA_GIT_RELATIVE_DIR}/*.md`
    })

    // Calculate submodule path by comparing user and root paths
    const submodule_base_path = user_base_directory
      .replace(root_base_directory, '')
      .replace(/^\//, '')

    // Get schemas from user repository
    const user_entities = await list_entity_files_from_git({
      repo_path: user_base_directory,
      branch: 'main',
      include_entity_types: ['type_definition', 'type_extension'],
      path_pattern: `${USER_SCHEMA_GIT_RELATIVE_DIR}/*.md`,
      submodule_base_path
    })

    // Combine entities from both repositories
    const all_entities = [...root_entities, ...user_entities]
    log(`Found ${all_entities.length} schema entities`)

    // Process schema files
    const schema_map = {}
    const type_extensions = []

    for (const entity_result of all_entities) {
      const entity = entity_result.entity_properties

      if (entity.type === 'type_definition') {
        schema_map[entity.type_name] = {
          ...entity,
          git_relative_path: entity_result.file_info.git_relative_path
        }
      } else if (entity.type === 'type_extension') {
        // Store extensions for later processing
        type_extensions.push({
          ...entity,
          git_relative_path: entity_result.file_info.git_relative_path
        })
      }
    }

    // Apply type extensions
    log(`Applying ${type_extensions.length} type extensions`)
    for (const extension of type_extensions) {
      const base_type = extension.extends

      if (schema_map[base_type]) {
        const base_schema = schema_map[base_type]

        // Merge properties
        schema_map[base_type] = {
          ...base_schema,
          properties: {
            ...(base_schema.properties || {}),
            ...(extension.properties || {})
          },
          // Track extensions
          extensions: [
            ...(base_schema.extensions || []),
            {
              git_relative_path: extension.git_relative_path,
              type_name: extension.type_name
            }
          ]
        }
      } else {
        log(
          `Extension ${extension.title} references unknown base type ${base_type}`
        )
        console.warn(
          `Extension ${extension.title} references unknown base type ${base_type}`
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
