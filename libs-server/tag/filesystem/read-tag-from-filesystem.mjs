import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { tag_exists_in_filesystem } from './tag-exists-in-filesystem.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

/**
 * Read a tag from the filesystem
 *
 * @param {Object} params Parameters
 * @param {string} params.base_relative_path Path relative to Base root, e.g., 'system/tag/<tag-title>.json' or 'tag/<tag-title>.json'
 * @param {string} [params.root_base_directory] Custom root base directory
 * @returns {Promise<Object>} Tag data
 * @throws {Error} If tag doesn't exist or reading fails
 */
export async function read_tag_from_filesystem({
  base_relative_path,
  root_base_directory = config.root_base_directory
} = {}) {
  if (!base_relative_path) {
    throw new Error('base_relative_path is required')
  }

  // Check if tag exists before trying to read
  const tag_exists = await tag_exists_in_filesystem({
    base_relative_path,
    root_base_directory
  })

  if (!tag_exists) {
    throw new Error(`Tag at ${base_relative_path} does not exist in filesystem`)
  }

  // Get file info
  const { absolute_path } = await get_base_file_info({
    base_relative_path,
    root_base_directory
  })

  try {
    // Read and parse the tag file
    const result = await read_entity_from_filesystem({
      absolute_path
    })

    if (!result.success) {
      throw new Error(result.error)
    }

    return {
      tag_content: result.raw_content,
      base_relative_path
    }
  } catch (error) {
    throw new Error(
      `Failed to read tag at ${base_relative_path}: ${error.message}`
    )
  }
}
