import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { list_markdown_files_in_filesystem } from '#root/libs-server/repository/filesystem/list-markdown-files-in-filesystem.mjs'
import is_main from '#libs-server/utils/is-main.mjs'
import config from '#config'

const log = debug('repository:list-entity-files')
debug.enable('repository:list-entity-files')

/**
 * List entities from the filesystem
 *
 * @param {Object} params - Parameters
 * @param {Array<string>} [params.include_entity_types] - Entity types to include (e.g., ['guideline', 'rule'])
 * @param {Array<string>} [params.exclude_entity_types] - Entity types to exclude
 * @param {string} params.root_base_directory - The root base directory to search in
 * @returns {Promise<Array>} - Array of entities that match the types
 */
export async function list_entity_files_in_filesystem({
  include_entity_types = [],
  exclude_entity_types = [],
  root_base_directory
}) {
  try {
    log(`Listing entities from filesystem in '${root_base_directory}'`)

    if (!root_base_directory) {
      throw new Error('root_base_directory is required')
    }

    const markdown_files = await list_markdown_files_in_filesystem({
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

if (is_main(import.meta.url)) {
  const argv = yargs(hideBin(process.argv))
    .option('root_base_directory', {
      alias: 'r',
      description: 'Root base directory to search in',
      type: 'string',
      demandOption: true,
      default: config.system_base_directory
    })
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
    .help().argv

  const main = async () => {
    let error
    try {
      const entities = await list_entity_files_in_filesystem({
        root_base_directory: argv.root_base_directory,
        include_entity_types: argv.include_entity_types,
        exclude_entity_types: argv.exclude_entity_types
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
