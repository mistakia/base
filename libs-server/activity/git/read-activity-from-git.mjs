import debug from 'debug'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { activity_exists_in_git } from './activity-exists-in-git.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('activity:read-from-git')

/**
 * Get the contents of an activity file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Activity ID in format [system|user]/<file_path>.md
 * @param {string} params.branch - Git branch to read from
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - Activity file contents and metadata
 */
export async function read_activity_from_git({
  base_relative_path,
  branch,
  root_base_directory = config.root_base_directory
}) {
  try {
    log(
      `Reading activity file from git: ${base_relative_path} (branch: ${branch})`
    )

    if (!base_relative_path) {
      return {
        success: false,
        error: 'Activity ID is required',
        base_relative_path,
        branch
      }
    }

    if (!branch) {
      return {
        success: false,
        error: 'Branch name is required',
        base_relative_path
      }
    }

    // Check if activity exists in git
    const activity_exists_result = await activity_exists_in_git({
      base_relative_path,
      branch,
      root_base_directory
    })

    if (!activity_exists_result.success) {
      return {
        success: false,
        error:
          activity_exists_result.error ||
          'Failed to check if activity exists in git',
        base_relative_path,
        branch
      }
    }

    if (!activity_exists_result.exists) {
      return {
        success: false,
        error: `Activity '${base_relative_path}' does not exist in branch '${branch}'`,
        base_relative_path,
        branch
      }
    }

    // Use the shared helper to get file info
    const { repo_path, git_relative_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    log(
      `Reading activity from git at path: ${git_relative_path} in repo: ${repo_path}`
    )

    // Use the entity reader to get the file contents from git
    const entity_result = await read_entity_from_git({
      repo_path,
      git_relative_path,
      branch
    })

    if (!entity_result.success) {
      return {
        success: false,
        error:
          entity_result.error ||
          `Failed to read activity '${base_relative_path}'`,
        base_relative_path,
        branch
      }
    }

    // Return activity with metadata
    return {
      success: true,
      base_relative_path,
      branch,
      entity_properties: entity_result.entity_properties,
      entity_content: entity_result.entity_content,
      raw_content: entity_result.raw_content
    }
  } catch (error) {
    log(`Error reading activity file from git: ${error.message}`)
    return {
      success: false,
      error: `Failed to read activity file from git: ${error.message}`,
      base_relative_path,
      branch
    }
  }
}
