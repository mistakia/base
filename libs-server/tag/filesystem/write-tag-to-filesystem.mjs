import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

/**
 * Write a tag to the filesystem
 *
 * @param {Object} params Parameters
 * @param {string} params.base_uri URI identifying the tag (e.g., 'sys:tag/name.md', 'user:tag/name.md')
 * @param {Object} params.tag_properties Tag properties (name, color, etc.)
 * @param {string} [params.tag_content=''] Content of the tag document
 * @returns {Promise<boolean>} True if successful
 * @throws {Error} If writing fails
 */
export async function write_tag_to_filesystem({
  base_uri,
  tag_properties,
  tag_content = ''
} = {}) {
  if (!base_uri) {
    throw new Error('base_uri is required')
  }

  if (!tag_properties || typeof tag_properties !== 'object') {
    throw new Error('tag_properties must be a valid object')
  }

  // Resolve absolute path using registry
  const absolute_path = resolve_base_uri_from_registry(base_uri)

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
    throw new Error(`Failed to write tag to ${base_uri}: ${error.message}`)
  }
}
