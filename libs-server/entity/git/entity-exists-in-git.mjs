import debug from 'debug'

import { file_exists_in_git } from '#libs-server/git/git-files/file-exists-in-git.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('entity-exists-in-git')

/**
 * Checks if an entity exists in Git
 *
 * @param {Object} options - Function options
 * @param {string} options.base_relative_path - Path relative to Base root, e.g., 'system/entity/<entity-title>.json'
 * @param {string} options.branch - The Git branch to check in
 * @param {string} [options.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - An object with a success flag and exists boolean
 */
export async function entity_exists_in_git({
  base_relative_path,
  branch,
  root_base_directory = config.root_base_directory
} = {}) {
  try {
    log(
      `Checking if entity exists at ${base_relative_path} in branch ${branch}`
    )

    // Validate required parameters
    if (!base_relative_path) {
      return {
        success: false,
        error: 'Base relative path is required',
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

    // Get file info
    const { repo_path, git_relative_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    // Check if the file exists in Git
    const result = await file_exists_in_git({
      repo_path,
      git_relative_path,
      branch
    })

    if (!result.success) {
      return result
    }

    return {
      success: true,
      exists: result.exists,
      git_relative_path,
      branch
    }
  } catch (error) {
    log(`Error checking if entity exists at ${base_relative_path}:`, error)
    return {
      success: false,
      error: error.message,
      base_relative_path,
      branch
    }
  }
}
