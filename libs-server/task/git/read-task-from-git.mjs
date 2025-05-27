import debug from 'debug'

import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { entity_exists_in_git } from '#libs-server/entity/git/entity-exists-in-git.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('task:read-from-git')

/**
 * Get the contents of a task file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Task ID in format [system|user]/<file_path>.md
 * @param {string} params.branch - Git branch to read from
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - Task file contents and metadata
 */
export async function read_task_from_git({
  base_relative_path,
  branch,
  root_base_directory = config.root_base_directory
}) {
  try {
    log(`Reading task file from git: ${base_relative_path} (branch: ${branch})`)

    if (!base_relative_path) {
      return {
        success: false,
        error: 'Task ID is required',
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

    // Check if task exists in git
    const exists_result = await entity_exists_in_git({
      base_relative_path,
      branch,
      root_base_directory
    })

    if (!exists_result.success) {
      return {
        success: false,
        error: exists_result.error || 'Failed to check if task exists in git',
        base_relative_path,
        branch
      }
    }

    if (!exists_result.exists) {
      return {
        success: false,
        error: `Task '${base_relative_path}' does not exist in branch '${branch}'`,
        base_relative_path,
        branch
      }
    }

    // Get file info using the shared helper
    const { repo_path, git_relative_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    // Read the entity from git
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
          `Failed to read task '${base_relative_path}' from git`,
        base_relative_path,
        branch
      }
    }

    // Return task with metadata
    return {
      success: true,
      base_relative_path,
      git_relative_path,
      repo_path,
      branch,
      entity_properties: entity_result.entity_properties,
      entity_content: entity_result.entity_content,
      raw_content: entity_result.raw_content
    }
  } catch (error) {
    log(`Error reading task file from git: ${error.message}`)
    return {
      success: false,
      error: `Failed to read task file from git: ${error.message}`,
      base_relative_path,
      branch
    }
  }
}
