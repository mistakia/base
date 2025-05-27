import { write_entity_to_filesystem } from '../../entity/filesystem/write-entity-to-filesystem.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

/**
 * Write a tag to the filesystem
 *
 * @param {Object} params Parameters
 * @param {string} params.base_relative_path Path relative to Base root, e.g., 'system/tag/<tag-title>.md' or 'tag/<tag-title>.md'
 * @param {Object} params.tag_properties Tag properties (name, color, etc.)
 * @param {string} [params.tag_content=''] Content of the tag document
 * @param {string} [params.root_base_directory] Custom root base directory
 * @returns {Promise<boolean>} True if successful
 * @throws {Error} If writing fails
 */
export async function write_tag_to_filesystem({
  base_relative_path,
  tag_properties,
  tag_content = '',
  root_base_directory = config.root_base_directory
} = {}) {
  if (!base_relative_path) {
    throw new Error('base_relative_path is required')
  }

  if (!tag_properties || typeof tag_properties !== 'object') {
    throw new Error('tag_properties must be a valid object')
  }

  // Get the absolute path for the tag file
  const { absolute_path } = await get_base_file_info({
    base_relative_path,
    root_base_directory
  })

  try {
    // Use write_entity_to_filesystem to write the tag
    const result = await write_entity_to_filesystem({
      absolute_path,
      entity_properties: tag_properties,
      entity_type: 'tag',
      entity_content: tag_content
    })

    return result
  } catch (error) {
    throw new Error(
      `Failed to write tag to ${base_relative_path}: ${error.message}`
    )
  }
}
