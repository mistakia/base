import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { read_from_git } = create_entity_accessors({
  entity_type: 'Task',
  debug_namespace: 'task:read-from-git'
})

/**
 * Get the contents of a task file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - Task ID in URI format (e.g., 'sys:task/name.md', 'user:task/name.md')
 * @param {string} params.branch - Git branch to read from
 * @returns {Promise<Object>} - Task file contents and metadata
 */
export const read_task_from_git = read_from_git
