import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

/**
 * Read a tag from the filesystem
 *
 * @param {Object} params Parameters
 * @param {string} params.base_uri URI identifying the tag (e.g., 'sys:tag/name.md', 'user:tag/name.md')
 * @returns {Promise<Object>} Tag data
 * @throws {Error} If tag doesn't exist or reading fails
 */
export async function read_tag_from_filesystem({ base_uri } = {}) {
  if (!base_uri) {
    throw new Error('base_uri is required')
  }

  // Resolve absolute path using registry
  const absolute_path = resolve_base_uri_from_registry(base_uri)

  try {
    // Read and parse the tag file
    const result = await read_entity_from_filesystem({
      absolute_path
    })

    if (!result.success) {
      throw new Error(result.error)
    }

    return {
      ...result,
      base_uri
    }
  } catch (error) {
    throw new Error(`Failed to read tag at ${base_uri}: ${error.message}`)
  }
}
