import debug from 'debug'

import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'
import { read_entity_from_filesystem } from './read-entity-from-filesystem.mjs'

const log = debug('entity:filesystem:get-entity-id')

/**
 * Gets an entity_id from a base_uri using the registry system
 *
 * @param {Object} params - Function options
 * @param {string} params.base_uri - URI identifying the entity (e.g., 'sys:entity/name.md', 'user:task/task.md')
 * @returns {Promise<Object>} - Result containing entity_id or error
 */
export async function get_entity_id_from_base_path({ base_uri } = {}) {
  try {
    log(`Getting entity_id for base path: ${base_uri}`)

    if (!base_uri) {
      throw new Error('base_uri is required')
    }

    // Resolve absolute path using registry
    const absolute_path = resolve_base_uri_from_registry(base_uri)
    log(`Resolved absolute path using registry: ${absolute_path}`)

    // Read entity from filesystem using absolute path
    const entity_result = await read_entity_from_filesystem({
      absolute_path
    })

    if (!entity_result.success) {
      return {
        success: false,
        error: entity_result.error || `Failed to read entity from ${base_uri}`,
        base_uri
      }
    }

    const entity_id = entity_result.entity_properties?.entity_id

    if (!entity_id) {
      return {
        success: false,
        error: `No entity_id found in entity properties for ${base_uri}`,
        base_uri
      }
    }

    log(`Successfully retrieved entity_id ${entity_id} for ${base_uri}`)

    return {
      success: true,
      entity_id,
      base_uri,
      entity_properties: entity_result.entity_properties
    }
  } catch (error) {
    log(`Error getting entity_id from base path ${base_uri}:`, error)
    return {
      success: false,
      error: error.message,
      base_uri
    }
  }
}
