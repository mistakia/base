import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { exists_in_filesystem } = create_entity_accessors({
  entity_type: 'Task',
  debug_namespace: 'task:exists-in-filesystem'
})

/**
 * Check if a task file exists in the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the task (e.g., 'user:task/name.md', 'sys:task/name.md')
 * @returns {Promise<boolean>} - True if task exists, false otherwise
 */
export const task_exists_in_filesystem = exists_in_filesystem
