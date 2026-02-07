import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { exists_in_filesystem } = create_entity_accessors({
  entity_type: 'Guideline',
  debug_namespace: 'guideline:exists-in-filesystem'
})

/**
 * Check if a guideline file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the guideline (e.g., 'sys:guideline/name.md', 'user:guideline/name.md')
 * @returns {Promise<boolean>} - True if guideline exists, false otherwise
 */
export const guideline_exists_in_filesystem = exists_in_filesystem
