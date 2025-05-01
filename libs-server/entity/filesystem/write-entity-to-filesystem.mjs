import debug from 'debug'

import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'
import {
  format_entity_to_file_content,
  format_entity_properties_to_frontmatter
} from '#libs-server/entity/format/index.mjs'

const log = debug('write-entity-to-filesystem')

/**
 * Writes an entity to the filesystem as a markdown file with frontmatter
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - The absolute path where the entity will be written
 * @param {Object} options.entity_properties - The entity properties to write
 * @param {string} options.entity_type - The type of entity being written
 * @param {string} [options.entity_content=''] - The markdown content to include after the frontmatter
 * @returns {Promise<boolean>} - Whether the write was successful
 */
export async function write_entity_to_filesystem({
  absolute_path,
  entity_properties,
  entity_type,
  entity_content = ''
}) {
  try {
    log(`Writing ${entity_type} entity to filesystem at ${absolute_path}`)

    if (!absolute_path) {
      throw new Error('Absolute path is required')
    }

    if (!entity_properties || typeof entity_properties !== 'object') {
      throw new Error('Entity properties must be a valid object')
    }

    if (!entity_type) {
      throw new Error('Entity type is required')
    }

    // Prepare the frontmatter with base entity fields
    const frontmatter = format_entity_properties_to_frontmatter({
      entity_properties,
      entity_type
    })

    // Format the entire file content with frontmatter
    const file_content = format_entity_to_file_content({
      frontmatter,
      file_content: entity_content
    })

    // Write the formatted content to the filesystem
    await write_file_to_filesystem({
      absolute_path,
      file_content
    })

    log(`Successfully wrote ${entity_type} entity to ${absolute_path}`)
    return true
  } catch (error) {
    log(`Error writing entity to filesystem at ${absolute_path}:`, error)
    throw error
  }
}
