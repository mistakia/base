import debug from 'debug'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { workflow_exists_in_filesystem } from './workflow-exists-in-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('workflow:read-from-filesystem')

/**
 * Get the contents of a workflow file from the filesystem using the registry system
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - Workflow ID in URI format (e.g., sys:workflow/name.md, user:workflow/name.md)
 * @returns {Promise<Object>} - Workflow file contents and metadata
 */
export async function read_workflow_from_filesystem({ base_uri }) {
  try {
    log(`Reading workflow file from filesystem: ${base_uri}`)

    // Check if workflow exists
    const workflow_file_exists = await workflow_exists_in_filesystem({
      base_uri
    })

    if (!workflow_file_exists) {
      return {
        success: false,
        error: `Workflow '${base_uri}' does not exist`,
        base_uri
      }
    }

    // Resolve absolute path using registry
    const absolute_path = resolve_base_uri_from_registry(base_uri)
    log(`Resolved absolute path using registry: ${absolute_path}`)

    // Use the entity reader to get the file contents
    const entity_result = await read_entity_from_filesystem({
      absolute_path
    })

    if (!entity_result.success) {
      return {
        success: false,
        error: entity_result.error || `Failed to read workflow '${base_uri}'`,
        base_uri,
        absolute_path
      }
    }

    // Return workflow with metadata
    return {
      success: true,
      base_uri,
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
      base_uri
    }
  }
}
