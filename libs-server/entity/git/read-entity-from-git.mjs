import debug from 'debug'

import { read_file_from_git } from '#libs-server/git/git-files/read-file-from-git.mjs'
import { format_entity_from_file_content } from '#libs-server/entity/format/format-entity-from-file-content.mjs'

const log = debug('read-entity-from-git')

/**
 * Reads an entity from git and parses its content
 *
 * @param {Object} options - Function options
 * @param {string} options.repo_path - The absolute path to the git repository
 * @param {string} options.git_relative_path - The relative path within the repository to the entity file
 * @param {string} options.branch - The git branch to read from
 * @returns {Promise<Object>} - The parsed entity data
 */
export async function read_entity_from_git({
  repo_path,
  git_relative_path,
  branch
}) {
  try {
    log(`Reading entity from git at ${git_relative_path} in branch ${branch}`)

    // Validate required parameters
    if (!repo_path) {
      throw new Error('Repository path is required')
    }

    if (!git_relative_path) {
      throw new Error('Git relative path is required')
    }

    if (!branch) {
      throw new Error('Branch name is required')
    }

    // Read file from git
    const git_result = await read_file_from_git({
      repo_path,
      git_relative_path,
      branch
    })

    if (!git_result.success) {
      return {
        success: false,
        error: git_result.error || 'Failed to read file from git',
        git_relative_path,
        branch
      }
    }

    // Parse the entity from file content
    const file_content = git_result.content
    const { entity_properties, entity_content } =
      format_entity_from_file_content({
        file_content,
        file_path: git_relative_path
      })

    // Get entity type from properties
    const entity_type = entity_properties.type

    if (!entity_type) {
      return {
        success: false,
        error: `No entity type found in properties for ${git_relative_path}`,
        git_relative_path,
        branch
      }
    }

    // Create result object with raw content included by default
    const result = {
      success: true,
      entity_properties,
      entity_content,
      raw_content: file_content,
      git_relative_path,
      branch
    }

    log(
      `Successfully read ${entity_type} entity from ${git_relative_path} in branch ${branch}`
    )
    return result
  } catch (error) {
    log(`Error reading entity from git at ${git_relative_path}:`, error)
    return {
      success: false,
      error: error.message,
      git_relative_path,
      branch
    }
  }
}
