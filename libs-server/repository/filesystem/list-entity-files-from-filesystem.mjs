import debug from 'debug'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { list_markdown_files_from_filesystem } from './list-markdown-files-from-filesystem.mjs'

const log = debug('repository:list-entity-files')

/**
 * List entities from the filesystem
 *
 * @param {Object} params - Parameters
 * @param {Array<string>} [params.include_entity_types] - Entity types to include (e.g., ['guideline', 'rule'])
 * @param {Array<string>} [params.exclude_entity_types] - Entity types to exclude
 * @param {string} params.root_base_directory - The root base directory to search in
 * @returns {Promise<Array>} - Array of entities that match the types
 */
export async function list_entity_files_from_filesystem({
  include_entity_types = [],
  exclude_entity_types = [],
  root_base_directory
}) {
  try {
    log(`Listing entities from filesystem in '${root_base_directory}'`)

    if (!root_base_directory) {
      throw new Error('root_base_directory is required')
    }

    // Find all markdown files using list_markdown_files_from_filesystem
    const markdown_files = await list_markdown_files_from_filesystem({
      root_base_directory
    })

    log(`Found ${markdown_files.length} markdown files`)

    // Process each file to check if it's one of the requested entity types
    const matching_entities = []

    for (const file_info of markdown_files) {
      try {
        // Read the entity
        const entity_result = await read_entity_from_filesystem({
          absolute_path: file_info.absolute_path
        })

        // Skip if reading failed
        if (!entity_result.success) {
          continue
        }

        const entity_type = entity_result.entity_properties.type

        // Check if entity type should be included/excluded
        const should_include =
          include_entity_types.length === 0 ||
          include_entity_types.includes(entity_type)
        const should_exclude = exclude_entity_types.includes(entity_type)

        if (should_include && !should_exclude) {
          // Add the base_relative_path and file_info to the result
          entity_result.base_relative_path = file_info.file_path
          entity_result.file_info = file_info
          matching_entities.push(entity_result)
        }
      } catch (error) {
        log(`Error processing file ${file_info.file_path}: ${error.message}`)
        // Continue with next file
      }
    }

    log(`Found ${matching_entities.length} matching entities`)
    return matching_entities
  } catch (error) {
    log(`Error listing entities: ${error.message}`)
    throw error
  }
}
