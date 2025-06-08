import debug from 'debug'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { task_exists_in_filesystem } from './task-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('task:read-from-filesystem')

/**
 * Get the contents of a task file from the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - URI identifying the task (e.g., 'user:task/name.md', 'sys:task/name.md')
 * @returns {Promise<Object>} - Task file contents and metadata
 */
export async function read_task_from_filesystem({ base_uri }) {
  try {
    log(`Reading task file from filesystem: ${base_uri}`)

    // Check if task exists
    const task_file_exists = await task_exists_in_filesystem({
      base_uri
    })

    if (!task_file_exists) {
      return {
        success: false,
        error: `Task '${base_uri}' does not exist`,
        base_uri
      }
    }

    // Resolve absolute path using registry
    const absolute_path = resolve_base_uri_from_registry(base_uri)

    log(`Reading task entity from path: ${absolute_path}`)

    // Use the entity reader to get the file contents
    const entity_result = await read_entity_from_filesystem({
      absolute_path
    })

    if (!entity_result.success) {
      return {
        success: false,
        error: entity_result.error || `Failed to read task '${base_uri}'`,
        base_uri,
        absolute_path
      }
    }

    // Return task with metadata
    return {
      success: true,
      base_uri,
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
      base_uri
    }
  }
}
