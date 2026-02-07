import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { read_from_git } = create_entity_accessors({
  entity_type: 'Tag',
  debug_namespace: 'tag:read-from-git'
})

/**
 * Get the contents of a tag file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - Tag ID in URI format (e.g., 'sys:tag/name.md', 'user:tag/name.md')
 * @param {string} params.branch - Git branch to read from
 * @returns {Promise<Object>} - Tag file contents and metadata
 */
export const read_tag_from_git = read_from_git
