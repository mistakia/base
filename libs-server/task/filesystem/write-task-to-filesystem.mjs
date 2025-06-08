import debug from 'debug'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'

const log = debug('task:write-to-filesystem')

/**
 * Write a task file to the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the task (e.g., 'user:task/name.md', 'sys:task/name.md')
 * @param {Object} params.task_properties - The task properties to write
 * @param {string} [params.task_content=''] - The markdown content to include after the frontmatter
 * @returns {Promise<Object>} - Result with success, error and path info
 */
export async function write_task_to_filesystem({
  base_uri,
  task_properties,
  task_content = ''
}) {
  try {
    log(`Writing task to filesystem: ${base_uri}`)

    if (!base_uri) {
      return {
        success: false,
        error: 'Task relative path is required'
      }
    }

    if (!task_properties || typeof task_properties !== 'object') {
      return {
        success: false,
        error: 'Task properties must be a valid object',
        base_uri
      }
    }

    // Set default status and priority if not provided
    if (!('status' in task_properties)) {
      task_properties.status = TASK_STATUS.NO_STATUS
    }
    if (!('priority' in task_properties)) {
      task_properties.priority = TASK_PRIORITY.NONE
    }

    // Resolve absolute path using registry
    const absolute_path = resolve_base_uri_from_registry(base_uri)

    log(`Writing task entity to path: ${absolute_path}`)

    // Use the entity writer to write the file
    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: task_properties,
      entity_type: 'task',
      entity_content: task_content
    })

    return {
      success: true,
      base_uri,
      absolute_path
    }
  } catch (error) {
    log(`Error writing task file: ${error.message}`)
    return {
      success: false,
      error: `Failed to write task file: ${error.message}`,
      base_uri
    }
  }
}
