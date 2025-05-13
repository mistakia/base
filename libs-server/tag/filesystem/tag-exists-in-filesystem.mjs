import { file_exists_in_filesystem_sync } from '../../filesystem/file-exists-in-filesystem-sync.mjs'
import { resolve_tag_path } from '../constants.mjs'

/**
 * Check if a tag exists in the filesystem
 *
 * @param {Object} params Parameters
 * @param {string} params.tag_id Tag ID to check in format [system|user]/<tag-title>
 * @param {string} [params.system_base_directory] Custom system base directory
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {boolean} Whether the tag exists
 */
export function tag_exists_in_filesystem({
  tag_id,
  system_base_directory,
  user_base_directory
} = {}) {
  if (!tag_id) {
    throw new Error('tag_id is required')
  }

  try {
    // Resolve the tag path
    const { file_path } = resolve_tag_path({
      tag_id,
      system_base_directory,
      user_base_directory
    })

    // Check if the file exists
    return file_exists_in_filesystem_sync({ file_path })
  } catch (error) {
    // If the tag_id format is invalid, the tag doesn't exist
    return false
  }
}
