import debug from 'debug'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { workflow_exists_in_filesystem } from './workflow-exists-in-filesystem.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('workflow:read-from-filesystem')

/**
 * Get the contents of a workflow file from the filesystem
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Workflow ID in format [system|user]/<file_path>.md
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - Workflow file contents and metadata
 */
export async function read_workflow_from_filesystem({
  base_relative_path,
  root_base_directory = config.root_base_directory
}) {
  try {
    log(`Reading workflow file from filesystem: ${base_relative_path}`)

    // Check if workflow exists
    const workflow_file_exists = await workflow_exists_in_filesystem({
      base_relative_path,
      root_base_directory
    })

    if (!workflow_file_exists) {
      return {
        success: false,
        error: `Workflow '${base_relative_path}' does not exist`,
        base_relative_path
      }
    }

    // Get the file path using the shared helper
    const { absolute_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    log(`Reading workflow entity from path: ${absolute_path}`)

    // Use the entity reader to get the file contents
    const entity_result = await read_entity_from_filesystem({
      absolute_path
    })

    if (!entity_result.success) {
      return {
        success: false,
        error:
          entity_result.error ||
          `Failed to read workflow '${base_relative_path}'`,
        base_relative_path,
        absolute_path
      }
    }

    // Return workflow with metadata
    return {
      success: true,
      base_relative_path,
      absolute_path,
      entity_properties: entity_result.entity_properties,
      entity_content: entity_result.entity_content,
      raw_content: entity_result.raw_content
    }
  } catch (error) {
    log(`Error reading workflow file: ${error.message}`)
    return {
      success: false,
      error: `Failed to read workflow file: ${error.message}`,
      base_relative_path
    }
  }
}
