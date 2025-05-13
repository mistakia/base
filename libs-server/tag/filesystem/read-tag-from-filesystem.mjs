import { read_file_from_filesystem } from '../../filesystem/read-file-from-filesystem.mjs'
import { tag_exists_in_filesystem } from './tag-exists-in-filesystem.mjs'
import { resolve_tag_path } from '../constants.mjs'

/**
 * Read a tag from the filesystem
 *
 * @param {Object} params Parameters
 * @param {string} params.tag_id Tag ID to read in format [system|user]/<tag-title>
 * @param {string} [params.system_base_directory] Custom system base directory
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Tag data
 * @throws {Error} If tag doesn't exist or reading fails
 */
export async function read_tag_from_filesystem({
  tag_id,
  system_base_directory,
  user_base_directory
} = {}) {
  if (!tag_id) {
    throw new Error('tag_id is required')
  }

  // Check if tag exists before trying to read
  const tag_exists = tag_exists_in_filesystem({
    tag_id,
    system_base_directory,
    user_base_directory
  })

  if (!tag_exists) {
    throw new Error(`Tag ${tag_id} does not exist in filesystem`)
  }

  // Resolve the tag path
  const { file_path, tag_title, type } = resolve_tag_path({
    tag_id,
    system_base_directory,
    user_base_directory
  })

  try {
    // Read and parse the tag file
    const tag_content = await read_file_from_filesystem({
      file_path
    })

    // Parse the JSON content
    const tag_data = JSON.parse(tag_content)

    // Add the type and tag_id properties if they're not already present
    return {
      ...tag_data,
      type: tag_data.type || type,
      tag_id: tag_data.tag_id || tag_id,
      title: tag_data.title || tag_title
    }
  } catch (error) {
    throw new Error(`Failed to read tag ${tag_id}: ${error.message}`)
  }
}
