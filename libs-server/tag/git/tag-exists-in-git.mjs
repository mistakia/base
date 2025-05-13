import { file_exists_in_git } from '../../git/git-files/file-exists-in-git.mjs'
import { resolve_tag_path } from '../constants.mjs'

/**
 * Check if a tag exists in git
 *
 * @param {Object} params Parameters
 * @param {string} params.tag_id Tag ID to check in format [system|user]/<tag-title>
 * @param {string} [params.ref] Git reference (branch, commit, tag)
 * @param {string} [params.repository_path] Path to the repository
 * @param {string} [params.system_base_directory] Custom system base directory
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<boolean>} Whether the tag exists
 */
export async function tag_exists_in_git({
  tag_id,
  ref,
  repository_path,
  system_base_directory,
  user_base_directory
} = {}) {
  if (!tag_id) {
    throw new Error('tag_id is required')
  }

  try {
    // Resolve the tag path
    const { base_relative_path } = resolve_tag_path({
      tag_id,
      system_base_directory,
      user_base_directory
    })

    // Check if the file exists in git
    return await file_exists_in_git({
      file_path: base_relative_path,
      ref,
      repository_path
    })
  } catch (error) {
    // If the tag_id format is invalid, the tag doesn't exist
    return false
  }
}
