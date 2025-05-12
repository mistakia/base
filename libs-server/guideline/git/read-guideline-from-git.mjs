import debug from 'debug'
import { read_file_from_git } from '#libs-server/git/git-files/read-file-from-git.mjs'
import { guideline_exists_in_git } from './guideline-exists-in-git.mjs'
import { resolve_guideline_path } from '../constants.mjs'

const log = debug('guideline:read-from-git')

/**
 * Read a guideline file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.guideline_id - Guideline ID in format [system|user]/<file_path>.md
 * @param {string} params.branch - Git branch to read from
 * @param {string} [params.system_base_directory] - Custom system base directory
 * @param {string} [params.user_base_directory] - Custom user base directory
 * @returns {Promise<Object>} - Guideline file contents and metadata
 */
export async function read_guideline_from_git({
  guideline_id,
  branch,
  system_base_directory,
  user_base_directory
}) {
  log(`Reading guideline from git: ${guideline_id} (branch: ${branch})`)

  try {
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

    // First check if the guideline exists in git
    const guideline_exists_result = await guideline_exists_in_git({
      guideline_id,
      branch,
      system_base_directory,
      user_base_directory
    })

    if (!guideline_exists_result.success) {
      return {
        success: false,
        error: guideline_exists_result.error,
        guideline_id,
        branch,
        exists: false
      }
    }

    if (!guideline_exists_result.exists) {
      return {
        success: false,
        error: `Guideline '${guideline_id}' does not exist in git branch '${branch}'`,
        guideline_id,
        branch,
        exists: false
      }
    }

    // Use the shared path resolution helper to get path components
    const { base_directory, base_relative_path, file_path } =
      resolve_guideline_path({
        guideline_id,
        system_base_directory,
        user_base_directory
      })

    log(
      `Reading guideline from git at path: ${base_relative_path} in repo: ${base_directory} (branch: ${branch})`
    )

    // Read the file from git
    const result = await read_file_from_git({
      repo_path: base_directory,
      file_path: base_relative_path,
      branch
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to read guideline from git',
        guideline_id,
        branch,
        exists: true
      }
    }

    return {
      success: true,
      guideline_id,
      branch,
      file_path,
      content: result.content,
      exists: true
    }
  } catch (error) {
    log(`Error reading guideline from git: ${error.message}`)
    return {
      success: false,
      error: error.message,
      guideline_id,
      branch
    }
  }
}
