import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { exists_in_filesystem } = create_entity_accessors({
  entity_type: 'Workflow',
  debug_namespace: 'workflow:exists-in-filesystem'
})

/**
 * Check if a workflow file exists in the filesystem using the registry system
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the workflow (e.g., 'sys:workflow/name.md', 'user:workflow/name.md')
 * @returns {Promise<boolean>} - True if workflow exists, false otherwise
 */
export const workflow_exists_in_filesystem = exists_in_filesystem
