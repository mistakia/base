import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { exists_in_filesystem } = create_entity_accessors({
  entity_type: 'Tag',
  debug_namespace: 'tag:exists-in-filesystem'
})

/**
 * Check if a tag file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the tag file
 * @returns {Promise<boolean>} - True if tag exists, false otherwise
 */
export const tag_exists_in_filesystem = exists_in_filesystem
