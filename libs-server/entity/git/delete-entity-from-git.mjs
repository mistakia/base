import debug from 'debug'

import { delete_file_from_git } from '#libs-server/git/git-files/delete-file-from-git.mjs'

const log = debug('delete-entity-from-git')

/**
 * Deletes an entity from Git
 *
 * @param {Object} options - Function options
 * @param {string} options.repo_path - The absolute path to the Git repository
 * @param {string} options.git_relative_path - The relative path within the repository to the entity file
 * @param {string} options.branch - The Git branch to delete from
 * @param {string} [options.commit_message] - Optional commit message to use when committing changes
 * @param {boolean} [options.force=false] - Force deletion even if the file has local modifications
 * @returns {Promise<Object>} - The result of the delete operation
 */
export async function delete_entity_from_git({
  repo_path,
  git_relative_path,
  branch,
  commit_message,
  force = false
}) {
  try {
    log(`Deleting entity at ${git_relative_path} in branch ${branch}`)

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

    // Generate default commit message if not provided
    const default_commit_message =
      commit_message || `Delete entity at ${git_relative_path}`

    // Delete the file from Git
    const result = await delete_file_from_git({
      repo_path,
      git_relative_path,
      branch,
      commit_message: default_commit_message,
      force
    })

    if (result.success) {
      log(
        `Successfully deleted entity at ${git_relative_path} in branch ${branch}`
      )
    } else {
      log(`Failed to delete entity at ${git_relative_path}:`, result.error)
    }

    return result
  } catch (error) {
    log(`Error deleting entity from Git at ${git_relative_path}:`, error)
    return {
      success: false,
      error: error.message,
      git_relative_path,
      branch
    }
  }
}
