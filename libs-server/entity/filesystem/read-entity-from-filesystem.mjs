import debug from 'debug'
import fs from 'fs/promises'

import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { format_entity_from_file_content } from '#libs-server/entity/format/format-entity-from-file-content.mjs'

const log = debug('read-entity-from-filesystem')

/**
 * Reads an entity from the filesystem and parses its content
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - The absolute path to the entity file
 * @returns {Promise<Object>} - The parsed entity data
 */
export async function read_entity_from_filesystem({ absolute_path } = {}) {
  try {
    log(`Reading entity from filesystem at ${absolute_path}`)

    if (!absolute_path) {
      throw new Error('Absolute path is required')
    }

    // Check if file exists
    const file_exists = await file_exists_in_filesystem({
      absolute_path
    })

    if (!file_exists) {
      return {
        success: false,
        error: `File not found at ${absolute_path}`,
        absolute_path
      }
    }

    // Read file content
    const file_content = await fs.readFile(absolute_path, 'utf8')

    // Parse the entity from file content
    const { entity_properties, entity_content, formatted_entity_metadata } =
      format_entity_from_file_content({
        file_content,
        file_path: absolute_path
      })

    // Get entity type from properties
    const entity_type = entity_properties.type

    if (!entity_type) {
      return {
        success: false,
        error: `No entity type found in properties for ${absolute_path}`,
        absolute_path
      }
    }

    // Create result object with raw content included by default
    const result = {
      success: true,
      entity_properties,
      entity_content,
      formatted_entity_metadata,
      raw_content: file_content,
      absolute_path
    }

    log(`Successfully read ${entity_type} entity from ${absolute_path}`)
    return result
  } catch (error) {
    log(`Error reading entity from filesystem at ${absolute_path}:`, error)
    return {
      success: false,
      error: error.message,
      absolute_path
    }
  }
}
