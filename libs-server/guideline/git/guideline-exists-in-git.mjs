import debug from 'debug'
import { file_exists_in_git } from '#libs-server/git/git-files/file-exists-in-git.mjs'
import { resolve_guideline_path } from '../constants.mjs'

const log = debug('guideline:exists-in-git')

/**
 * Check if a guideline file exists in a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.guideline_id - Guideline ID in format [system|user]/<file_path>.md
 * @param {string} params.branch - Git branch to check in
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<Object>} - Object with success and exists properties
 */
export async function guideline_exists_in_git({
  guideline_id,
  branch,
  system_base_directory,
  user_base_directory
}) {
  try {
    log(
      `Checking if guideline exists in git: ${guideline_id} (branch: ${branch})`
    )

    if (!guideline_id) {
      return {
        success: false,
        error: 'Guideline ID is required',
        guideline_id,
        branch
      }
    }

    if (!branch) {
      return {
        success: false,
        error: 'Branch name is required',
        guideline_id
      }
    }

    // Use the shared path resolution helper to get path components
    const { base_directory, base_relative_path } = resolve_guideline_path({
      guideline_id,
      system_base_directory,
      user_base_directory
    })

    // For git operations, we need:
    // 1. The repo_path (base directory where the git repo is)
    // 2. The relative path within the repository that matches git's structure

    log(
      `Checking guideline in git at path: ${base_relative_path} in repo: ${base_directory}`
    )

    // Check if file exists in git
    const result = await file_exists_in_git({
      repo_path: base_directory,
      file_path: base_relative_path,
      branch
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to check if guideline exists in git',
        guideline_id,
        branch
      }
    }

    return {
      success: true,
      exists: result.exists,
      guideline_id,
      branch
    }
  } catch (error) {
    log(`Error checking if guideline exists in git: ${error.message}`)
    return {
      success: false,
      error: error.message,
      guideline_id,
      branch
    }
  }
}
