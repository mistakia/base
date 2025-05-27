import debug from 'debug'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { list_markdown_files_from_git } from './list-markdown-files-from-git.mjs'

const log = debug('repository:list-entity-files')

/**
 * List entities from a git repository
 *
 * @param {Object} params - Parameters
 * @param {Array<string>} [params.include_entity_types] - Entity types to include (e.g., ['guideline', 'rule'])
 * @param {Array<string>} [params.exclude_entity_types] - Entity types to exclude
 * @param {string} params.repo_path - Path to the git repository
 * @param {string} params.branch - Git branch to scan
 * @param {string} [params.path_pattern] - Pattern for files to include (default: '*.md')
 * @param {string} [params.submodule_base_path] - Base path if repository is a submodule
 * @returns {Promise<Array>} - Array of entities that match the types
 */
export async function list_entity_files_from_git({
  include_entity_types = [],
  exclude_entity_types = [],
  repo_path,
  branch,
  path_pattern = '*.md',
  submodule_base_path = null
}) {
  try {
    log(`Listing entities from git repository at ${repo_path}`)

    if (!repo_path) {
      throw new Error('repo_path is required')
    }

    if (!branch) {
      throw new Error('branch is required')
    }

    // Get all markdown files from the git repository
    const markdown_files = await list_markdown_files_from_git({
      repo_path,
      branch,
      path_pattern,
      submodule_base_path
    })

    log(`Found ${markdown_files.length} markdown files in git repository`)

    // Process each file to check if it's one of the requested entity types
    const matching_entities = []

    for (const file_info of markdown_files) {
      try {
        // Read the entity from git
        const entity_result = await read_entity_from_git({
          repo_path: file_info.repo_path,
          git_relative_path: file_info.git_relative_path,
          branch: file_info.branch
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
          // Add file info to the entity result
          entity_result.file_info = file_info

          // Calculate base_relative_path if it doesn't exist
          if (!entity_result.base_relative_path) {
            // For submodules
            if (submodule_base_path) {
              entity_result.base_relative_path = `${submodule_base_path}/${file_info.git_relative_path}`
            }
            // For root repository
            else {
              entity_result.base_relative_path = file_info.git_relative_path
            }
          }

          matching_entities.push(entity_result)
        }
      } catch (error) {
        log(
          `Error processing file ${file_info.git_relative_path}: ${error.message}`
        )
        // Continue with next file
      }
    }

    log(`Found ${matching_entities.length} matching entities`)
    return matching_entities
  } catch (error) {
    log(`Error listing entities from git: ${error.message}`)
    throw error
  }
}
