import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { list_markdown_files_in_filesystem } from './list-markdown-files-in-filesystem.mjs'
import { read_entity_from_filesystem } from '../../entity/filesystem/read-entity-from-filesystem.mjs'
import is_main from '#libs-server/utils/is-main.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'

const log = debug('repository:filesystem:list-entity-files')

/**
 * List entity files from filesystem with optional filtering
 *
 * @param {Object} params - Parameters
 * @param {string[]} [params.include_entity_types] - Entity types to include
 * @param {string[]} [params.exclude_entity_types] - Entity types to exclude
 * @param {string} [params.path_pattern] - Glob pattern for filtering paths
 * @returns {Promise<Array>} - Array of entity file objects with properties and metadata
 */
export async function list_entity_files_from_filesystem({
  include_entity_types = [],
  exclude_entity_types = [],
  path_pattern
}) {
  try {
    log('Listing entities from filesystem')

    // Get all markdown files using existing function, passing path_pattern directly
    const all_files = await list_markdown_files_in_filesystem({
      path_pattern
    })

    log(
      `Found ${all_files.length} markdown files, filtering by entity types...`
    )

    // Read and filter entities
    const entities = []
    for (const file of all_files) {
      try {
        const entity_result = await read_entity_from_filesystem({
          absolute_path: file.absolute_path
        })

        if (!entity_result.success || !entity_result.entity_properties) {
          continue
        }

        const entity_type = entity_result.entity_properties.type

        // Check if entity type should be included/excluded
        const should_include =
          include_entity_types.length === 0 ||
          include_entity_types.includes(entity_type)
        const should_exclude =
          exclude_entity_types.length > 0 &&
          exclude_entity_types.includes(entity_type)

        if (should_include && !should_exclude) {
          // Add to results with consistent format
          // Include base_uri to match the original function's output
          entities.push({
            entity_properties: entity_result.entity_properties,
            file_info: file
          })
        }
      } catch (error) {
        log(`Error processing file ${file.absolute_path}: ${error.message}`)
      }
    }

    log(`Found ${entities.length} entity files matching criteria`)
    return entities
  } catch (error) {
    log(`Error listing entity files: ${error.message}`)
    throw error
  }
}

export default list_entity_files_from_filesystem

// Add CLI functionality if run directly
if (is_main(import.meta.url)) {
  const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
    .option('include_entity_types', {
      alias: 'i',
      description: 'Entity types to include (e.g., guideline,rule)',
      type: 'string',
      coerce: (arg) => (arg ? arg.split(',') : [])
    })
    .option('exclude_entity_types', {
      alias: 'e',
      description: 'Entity types to exclude (e.g., guideline,rule)',
      type: 'string',
      coerce: (arg) => (arg ? arg.split(',') : [])
    })
    .option('path_pattern', {
      alias: 'p',
      description: 'Path pattern to filter by (e.g., "system/schema/*.md")',
      type: 'string'
    })
    .help().argv

  const main = async () => {
    // Handle directory registration using the reusable function
    handle_cli_directory_registration(argv)

    let error
    try {
      const entities = await list_entity_files_from_filesystem({
        include_entity_types: argv.include_entity_types,
        exclude_entity_types: argv.exclude_entity_types,
        path_pattern: argv.path_pattern
      })
      console.log(`Found ${entities.length} matching entities`)
      console.log(JSON.stringify(entities, null, 2))

      const entity_types = entities.map((e) => e.entity_properties.type)
      const unique_entity_types = [...new Set(entity_types)]
      console.log(`Unique entity types: ${unique_entity_types.join(', ')}`)
    } catch (err) {
      error = err
      console.error('Error:', error.message)
    }
    process.exit(error ? 1 : 0)
  }

  main()
}
