import { file_exists_in_git } from '#libs-server/git/git-files/file-exists-in-git.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

/**
 * Check if a tag exists in git
 *
 * @param {Object} params Parameters
 * @param {string} params.base_relative_path Path relative to Base root, e.g., 'system/tag/<tag-title>.json' or 'tag/<tag-title>.json'
 * @param {string} params.branch Git reference (branch, commit, tag)
 * @param {string} [params.root_base_directory] Custom root base directory
 * @returns {Promise<boolean>} Whether the tag exists
 */
export async function tag_exists_in_git({
  base_relative_path,
  branch,
  root_base_directory = config.root_base_directory
} = {}) {
  if (!base_relative_path) {
    throw new Error('base_relative_path is required')
  }

  try {
    // Get file info
    const { repo_path, git_relative_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    // Check if the file exists in git
    return await file_exists_in_git({
      git_relative_path,
      branch,
      repo_path
    })
  } catch (error) {
    // If there's an error getting file info, the tag doesn't exist
    return false
  }
}
