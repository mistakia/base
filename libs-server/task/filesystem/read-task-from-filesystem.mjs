import { create_entity_accessors } from '#libs-server/entity/create-entity-accessors.mjs'

const { read_from_filesystem } = create_entity_accessors({
  entity_type: 'Task',
  debug_namespace: 'task:read-from-filesystem'
})

/**
 * Get the contents of a task file from the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the task (e.g., 'user:task/name.md', 'sys:task/name.md')
 * @returns {Promise<Object>} - Task file contents and metadata
 */
export const read_task_from_filesystem = read_from_filesystem
