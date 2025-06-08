import debug from 'debug'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { list_markdown_files_from_git } from './list-markdown-files-from-git.mjs'
import { create_base_uri_from_git_file } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('repository:list-entity-files')

/**
 * Process a single markdown file to check if it matches entity type criteria
 * @param {Object} file_info - File information from git
 * @param {Array<string>} include_entity_types - Entity types to include
 * @param {Array<string>} exclude_entity_types - Entity types to exclude
 * @returns {Promise<Object|null>} - Entity result or null if not matching
 */
async function process_entity_file(
  file_info,
  include_entity_types,
  exclude_entity_types
) {
  try {
    // Read the entity from git
    const entity_result = await read_entity_from_git({
      repo_path: file_info.repo_path,
      git_relative_path: file_info.git_relative_path,
      branch: file_info.branch
    })

    // Skip if reading failed
    if (!entity_result.success) {
      return null
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

      // Calculate base_uri if it doesn't exist
      if (!entity_result.base_uri) {
        entity_result.base_uri = create_base_uri_from_git_file({
          git_relative_path: file_info.git_relative_path,
          repo_path: file_info.repo_path
        })
      }

      return entity_result
    }

    return null
  } catch (error) {
    log(
      `Error processing file ${file_info.git_relative_path}: ${error.message}`
    )
    return null
  }
}

/**
 * List entities from a git repository
 *
 * @param {Object} params - Parameters
 * @param {Array<string>} [params.include_entity_types] - Entity types to include (e.g., ['guideline', 'rule'])
 * @param {Array<string>} [params.exclude_entity_types] - Entity types to exclude
 * @param {string} params.repo_path - Path to the git repository
 * @param {string} params.branch - Git branch to scan
 * @param {string} [params.path_pattern] - Pattern for files to include (default: '*.md')
 * @param {boolean} [params.is_system_repo] - Whether the repository is a system repository (default: false)
 * @returns {Promise<Array>} - Array of entities that match the types
 */
export async function list_entity_files_from_git({
  include_entity_types = [],
  exclude_entity_types = [],
  repo_path,
  branch,
  path_pattern = '*.md',
  is_system_repo = false
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
      is_system_repo
    })

    log(`Found ${markdown_files.length} markdown files in git repository`)

    // Process each file to check if it's one of the requested entity types
    const matching_entities = []

    for (const file_info of markdown_files) {
      const entity_result = await process_entity_file(
        file_info,
        include_entity_types,
        exclude_entity_types
      )

      if (entity_result) {
        matching_entities.push(entity_result)
      }
    }

    log(`Found ${matching_entities.length} matching entities`)
    return matching_entities
  } catch (error) {
    log(`Error listing entities from git: ${error.message}`)
    throw error
  }
}
