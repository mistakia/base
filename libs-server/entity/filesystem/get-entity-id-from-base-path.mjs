import debug from 'debug'

import config from '#config'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import { read_entity_from_filesystem } from './read-entity-from-filesystem.mjs'

const log = debug('entity:filesystem:get-entity-id')

/**
 * Gets an entity_id from a base_relative_path
 *
 * @param {Object} params - Function options
 * @param {string} params.base_relative_path - Path relative to Base root
 * @param {string} params.root_base_directory - Absolute path to the Base root directory
 * @returns {Promise<Object>} - Result containing entity_id or error
 */
export async function get_entity_id_from_base_path({
  base_relative_path,
  root_base_directory = config.root_base_directory
} = {}) {
  try {
    log(`Getting entity_id for base path: ${base_relative_path}`)

    if (!base_relative_path) {
      throw new Error('base_relative_path is required')
    }

    if (!root_base_directory) {
      throw new Error('root_base_directory is required')
    }

    // Get file info to determine absolute path
    const file_info = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    // Read entity from filesystem using absolute path
    const entity_result = await read_entity_from_filesystem({
      absolute_path: file_info.absolute_path
    })

    if (!entity_result.success) {
      return {
        success: false,
        error:
          entity_result.error ||
          `Failed to read entity from ${base_relative_path}`,
        base_relative_path
      }
    }

    const entity_id = entity_result.entity_properties?.entity_id

    if (!entity_id) {
      return {
        success: false,
        error: `No entity_id found in entity properties for ${base_relative_path}`,
        base_relative_path
      }
    }

    log(
      `Successfully retrieved entity_id ${entity_id} for ${base_relative_path}`
    )

    return {
      success: true,
      entity_id,
      base_relative_path,
      entity_properties: entity_result.entity_properties
    }
  } catch (error) {
    log(`Error getting entity_id from base path ${base_relative_path}:`, error)
    return {
      success: false,
      error: error.message,
      base_relative_path
    }
  }
}
