import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { read_from_filesystem } = create_entity_accessors({
  entity_type: 'Tag',
  debug_namespace: 'tag:read-from-filesystem'
})

/**
 * Read a tag from the filesystem
 *
 * @param {Object} params Parameters
 * @param {string} params.base_uri URI identifying the tag (e.g., 'sys:tag/name.md', 'user:tag/name.md')
 * @returns {Promise<Object>} Tag data with success flag
 */
export const read_tag_from_filesystem = read_from_filesystem
