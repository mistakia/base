import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { read_from_git } = create_entity_accessors({
  entity_type: 'Workflow',
  debug_namespace: 'workflow:read-from-git'
})

/**
 * Get the contents of a workflow file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - Workflow ID in URI format (e.g., 'sys:workflow/name.md', 'user:workflow/name.md')
 * @param {string} params.branch - Git branch to read from
 * @returns {Promise<Object>} - Workflow file contents and metadata
 */
export const read_workflow_from_git = read_from_git
