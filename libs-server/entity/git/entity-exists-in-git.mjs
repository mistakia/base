import debug from 'debug'

import { file_exists_in_git } from '#libs-server/git/git-files/file-exists-in-git.mjs'

const log = debug('entity-exists-in-git')

/**
 * Checks if an entity exists in Git
 *
 * @param {Object} options - Function options
 * @param {string} options.repo_path - The absolute path to the Git repository
 * @param {string} options.file_path - The relative path within the repository to the entity file
 * @param {string} options.branch - The Git branch to check in
 * @returns {Promise<Object>} - An object with a success flag and exists boolean
 */
export async function entity_exists_in_git({ repo_path, file_path, branch }) {
  try {
    log(`Checking if entity exists at ${file_path} in branch ${branch}`)

    // Validate required parameters
    if (!repo_path) {
      return {
        success: false,
        error: 'Repository path is required',
        file_path,
        branch
      }
    }

    if (!file_path) {
      return {
        success: false,
        error: 'File path is required',
        repo_path,
        branch
      }
    }

    if (!branch) {
      return {
        success: false,
        error: 'Branch name is required',
        repo_path,
        file_path
      }
    }

    // Check if the file exists in Git
    const result = await file_exists_in_git({
      repo_path,
      file_path,
      branch
    })

    if (!result.success) {
      return result
    }

    return {
      success: true,
      exists: result.exists,
      file_path,
      branch
    }
  } catch (error) {
    log(`Error checking if entity exists at ${file_path}:`, error)
    return {
      success: false,
      error: error.message,
      file_path,
      branch
    }
  }
}
