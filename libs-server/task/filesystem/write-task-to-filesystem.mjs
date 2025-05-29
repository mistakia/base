import debug from 'debug'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'

const log = debug('task:write-to-filesystem')

/**
 * Write a task file to the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Task ID in format [system|user]/<file_path>.md
 * @param {Object} params.task_properties - The task properties to write
 * @param {string} [params.task_content=''] - The markdown content to include after the frontmatter
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - Result with success, error and path info
 */
export async function write_task_to_filesystem({
  base_relative_path,
  task_properties,
  task_content = '',
  root_base_directory = config.root_base_directory
}) {
  try {
    log(`Writing task to filesystem: ${base_relative_path}`)

    if (!base_relative_path) {
      return {
        success: false,
        error: 'Task relative path is required'
      }
    }

    if (!task_properties || typeof task_properties !== 'object') {
      return {
        success: false,
        error: 'Task properties must be a valid object',
        base_relative_path
      }
    }

    // Set default status and priority if not provided
    if (!('status' in task_properties)) {
      task_properties.status = TASK_STATUS.NO_STATUS
    }
    if (!('priority' in task_properties)) {
      task_properties.priority = TASK_PRIORITY.NONE
    }

    // Get the file path using the shared helper
    const { absolute_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

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
      base_relative_path,
      absolute_path
    }
  } catch (error) {
    log(`Error writing task file: ${error.message}`)
    return {
      success: false,
      error: `Failed to write task file: ${error.message}`,
      base_relative_path
    }
  }
}
