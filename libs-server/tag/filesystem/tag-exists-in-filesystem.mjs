import { file_exists_in_filesystem_sync } from '../../filesystem/file-exists-in-filesystem-sync.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

/**
 * Check if a tag exists in the filesystem
 *
 * @param {Object} params Parameters
 * @param {string} params.base_relative_path Path relative to Base root, e.g., 'system/tag/<tag-title>.json' or 'tag/<tag-title>.json'
 * @param {string} [params.root_base_directory] Custom root base directory
 * @returns {Promise<boolean>} Whether the tag exists
 */
export async function tag_exists_in_filesystem({
  base_relative_path,
  root_base_directory = config.root_base_directory
} = {}) {
  if (!base_relative_path) {
    throw new Error('base_relative_path is required')
  }

  try {
    // Get file info
    const { absolute_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    // Check if the file exists
    return file_exists_in_filesystem_sync({ file_path: absolute_path })
  } catch (error) {
    // If there's an error getting file info, the tag doesn't exist
    return false
  }
}
