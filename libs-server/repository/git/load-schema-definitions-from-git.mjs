import debug from 'debug'
import { list_markdown_files_from_git } from './list-markdown-files-from-git.mjs'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'

const log = debug('repository:git:load-schemas')

// Schema directory constants
const SYSTEM_SCHEMA_GIT_RELATIVE_DIR = 'system/schema'
const USER_SCHEMA_GIT_RELATIVE_DIR = 'schema'

/**
 * Load schema definitions from git repositories
 *
 * @param {Object} options - Options for loading schemas
 * @param {Object} options.system_repository - System repository configuration
 * @param {Object} options.user_repository - User repository configuration
 * @returns {Promise<Object>} - Map of schema definitions by name
 */
export async function load_schema_definitions_from_git({
  system_repository,
  user_repository
} = {}) {
  // Validate input
  if (!system_repository) {
    throw new Error('system_repository is required')
  }

  if (!user_repository) {
    throw new Error('user_repository is required')
  }

  try {
    // Collect all schema files from repositories
    log('Scanning repositories for schema files')
    // TODO should use list_entity_files_from_git instead
    const all_files = await list_markdown_files_from_git([
      system_repository,
      user_repository
    ])
    const schema_files = all_files.filter((file) => {
      return (
        (file.git_relative_path.startsWith(SYSTEM_SCHEMA_GIT_RELATIVE_DIR) ||
          file.git_relative_path.startsWith(USER_SCHEMA_GIT_RELATIVE_DIR)) &&
        file.git_relative_path.endsWith('.md')
      )
    })

    log(`Found ${schema_files.length} schema files`)

    // Process schema files
    const schema_map = {}
    const type_extensions = []

    for (const file of schema_files) {
      try {
        // Parse schema file
        const entity_result = await read_entity_from_git({
          repo_path: file.repo_path,
          file_path: file.git_relative_path,
          branch: file.branch
        })

        if (!entity_result.success) {
          log(`Error reading entity from git: ${entity_result.error}`)
          continue
        }

        if (entity_result.entity_properties.type === 'type_definition') {
          schema_map[entity_result.entity_properties.name] = {
            ...entity_result.entity_properties,
            git_relative_path: file.git_relative_path
          }
        } else if (entity_result.entity_properties.type === 'type_extension') {
          // Store extensions for later processing
          type_extensions.push({
            ...entity_result.entity_properties,
            git_relative_path: file.git_relative_path
          })
        }
      } catch (error) {
        log(`Error parsing schema file ${file.git_relative_path}:`, error)
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
              name: extension.name
            }
          ]
        }
      } else {
        log(
          `Extension ${extension.name} references unknown base type ${base_type}`
        )
        console.warn(
          `Extension ${extension.name} references unknown base type ${base_type}`
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
