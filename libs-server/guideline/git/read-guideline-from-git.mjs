import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { read_from_git } = create_entity_accessors({
  entity_type: 'Guideline',
  debug_namespace: 'guideline:read-from-git'
})

/**
 * Get the contents of a guideline file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - Guideline ID in URI format (e.g., 'sys:guideline/name.md', 'user:guideline/name.md')
 * @param {string} params.branch - Git branch to read from
 * @returns {Promise<Object>} - Guideline file contents and metadata
 */
export const read_guideline_from_git = read_from_git
