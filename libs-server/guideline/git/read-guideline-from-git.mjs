import debug from 'debug'
import { read_file_from_git } from '#libs-server/git/git-files/read-file-from-git.mjs'
import { entity_exists_in_git } from '#libs-server/entity/git/entity-exists-in-git.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('guideline:read-from-git')

/**
 * Read a guideline file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Guideline path relative to Base root, e.g., 'system/guideline/<file_path>.md' or 'guideline/<file_path>.md'
 * @param {string} params.branch - Git branch to read from
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - Guideline file contents and metadata
 */
export async function read_guideline_from_git({
  base_relative_path,
  branch,
  root_base_directory = config.root_base_directory
}) {
  log(`Reading guideline from git: ${base_relative_path} (branch: ${branch})`)

  try {
    if (!base_relative_path) {
      return {
        success: false,
        error: 'Guideline base relative path is required',
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

    // First check if the guideline exists in git
    const guideline_exists_result = await entity_exists_in_git({
      base_relative_path,
      branch,
      root_base_directory
    })

    if (!guideline_exists_result.success) {
      return {
        success: false,
        error: guideline_exists_result.error,
        base_relative_path,
        branch,
        exists: false
      }
    }

    if (!guideline_exists_result.exists) {
      return {
        success: false,
        error: `Guideline '${base_relative_path}' does not exist in git branch '${branch}'`,
        base_relative_path,
        branch,
        exists: false
      }
    }

    // Use the shared helper to get file info
    const { repo_path, git_relative_path, absolute_path } =
      await get_base_file_info({
        base_relative_path,
        root_base_directory
      })

    log(
      `Reading guideline from git at path: ${git_relative_path} in repo: ${repo_path} (branch: ${branch})`
    )

    // Read the file from git
    const result = await read_file_from_git({
      repo_path,
      git_relative_path,
      branch
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to read guideline from git',
        base_relative_path,
        branch,
        exists: true
      }
    }

    return {
      success: true,
      base_relative_path,
      branch,
      absolute_path,
      content: result.content,
      exists: true
    }
  } catch (error) {
    log(`Error reading guideline from git: ${error.message}`)
    return {
      success: false,
      error: error.message,
      base_relative_path,
      branch
    }
  }
}
