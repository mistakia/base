import debug from 'debug'
import { file_exists_in_git } from '#libs-server/git/git-files/file-exists-in-git.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('activity:exists-in-git')

/**
 * Check if an activity file exists in a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Activity ID in format [system|user]/<file_path>.md
 * @param {string} params.branch - Git branch to check in
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - Object with success and exists properties
 */
export async function activity_exists_in_git({
  base_relative_path,
  branch,
  root_base_directory = config.root_base_directory
}) {
  try {
    log(
      `Checking if activity exists in git: ${base_relative_path} (branch: ${branch})`
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

    // Use the shared helper to get file info
    const { repo_path, git_relative_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    // For git operations, we need:
    // 1. The repo_path (base directory where the git repo is)
    // 2. The relative path within the repository that matches git's structure

    log(
      `Checking activity in git at path: ${git_relative_path} in repo: ${repo_path}`
    )

    // Check if file exists in git
    const result = await file_exists_in_git({
      repo_path,
      git_relative_path,
      branch
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to check if activity exists in git',
        base_relative_path,
        branch
      }
    }

    return {
      success: true,
      exists: result.exists,
      base_relative_path,
      branch
    }
  } catch (error) {
    log(`Error checking if activity exists in git: ${error.message}`)
    return {
      success: false,
      error: error.message,
      base_relative_path,
      branch
    }
  }
}
