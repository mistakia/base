import debug from 'debug'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { task_exists_in_filesystem } from './task-exists-in-filesystem.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('task:read-from-filesystem')

/**
 * Get the contents of a task file from the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Task ID in format [system|user]/<file_path>.md
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - Task file contents and metadata
 */
export async function read_task_from_filesystem({
  base_relative_path,
  root_base_directory = config.root_base_directory
}) {
  try {
    log(`Reading task file from filesystem: ${base_relative_path}`)

    // Check if task exists
    const task_file_exists = await task_exists_in_filesystem({
      base_relative_path,
      root_base_directory
    })

    if (!task_file_exists) {
      return {
        success: false,
        error: `Task '${base_relative_path}' does not exist`,
        base_relative_path
      }
    }

    // Get the file path using the shared helper
    const { absolute_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    log(`Reading task entity from path: ${absolute_path}`)

    // Use the entity reader to get the file contents
    const entity_result = await read_entity_from_filesystem({
      absolute_path
    })

    if (!entity_result.success) {
      return {
        success: false,
        error:
          entity_result.error || `Failed to read task '${base_relative_path}'`,
        base_relative_path,
        absolute_path
      }
    }

    // Return task with metadata
    return {
      success: true,
      base_relative_path,
      absolute_path,
      entity_properties: entity_result.entity_properties,
      entity_content: entity_result.entity_content,
      raw_content: entity_result.raw_content
    }
  } catch (error) {
    log(`Error reading task file: ${error.message}`)
    return {
      success: false,
      error: `Failed to read task file: ${error.message}`,
      base_relative_path
    }
  }
}
