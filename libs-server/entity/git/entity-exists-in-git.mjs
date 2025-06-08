import debug from 'debug'

import { file_exists_in_git } from '#libs-server/git/git-files/file-exists-in-git.mjs'
import { get_git_info_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('entity-exists-in-git')

/**
 * Checks if an entity exists in Git
 *
 * @param {Object} options - Function options
 * @param {string} options.base_uri - URI identifying the entity (e.g., 'sys:entity/name.md', 'user:task/task.md')
 * @param {string} options.branch - The Git branch to check in
 * @returns {Promise<Object>} - An object with a success flag and exists boolean
 */
export async function entity_exists_in_git({ base_uri, branch } = {}) {
  try {
    log(`Checking if entity exists at ${base_uri} in branch ${branch}`)

    // Validate required parameters
    if (!base_uri) {
      return {
        success: false,
        error: 'Base URI is required',
        branch
      }
    }

    if (!branch) {
      return {
        success: false,
        error: 'Branch name is required',
        base_uri
      }
    }

    // Get git info using registry
    const { git_relative_path, repo_path } =
      get_git_info_from_registry(base_uri)
    log(
      `Using registry for git info: repo=${repo_path}, path=${git_relative_path}`
    )

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
    log(`Error checking if entity exists at ${base_uri}:`, error)
    return {
      success: false,
      error: error.message,
      base_uri,
      branch
    }
  }
}
