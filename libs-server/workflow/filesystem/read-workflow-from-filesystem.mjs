import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { read_from_filesystem } = create_entity_accessors({
  entity_type: 'Workflow',
  debug_namespace: 'workflow:read-from-filesystem'
})

/**
 * Get the contents of a workflow file from the filesystem using the registry system
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - Workflow ID in URI format (e.g., sys:workflow/name.md, user:workflow/name.md)
 * @returns {Promise<Object>} - Workflow file contents and metadata
 */
export const read_workflow_from_filesystem = read_from_filesystem
