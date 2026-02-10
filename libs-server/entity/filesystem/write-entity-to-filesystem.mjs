import debug from 'debug'
import { v4 as uuid } from 'uuid'
import { write_document_to_filesystem } from '#libs-server/markdown/write-document-to-filesystem.mjs'
import { format_entity_properties_to_frontmatter } from '#libs-server/entity/format/index.mjs'
import { format_markdown_file_with_prettier } from '#libs-server/formatting/format-markdown-file-with-prettier.mjs'

const log = debug('write-entity-to-filesystem')

/**
 * Writes an entity to the filesystem as a markdown file with frontmatter
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - The absolute path where the entity will be written
 * @param {Object} options.entity_properties - The entity properties to write
 * @param {string} options.entity_type - The type of entity being written
 * @param {string} [options.entity_content=''] - The markdown content to include after the frontmatter
 * @returns {Promise<Object>} - Result object with success status and entity_id
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

    // Ensure entity_id exists - critical for database synchronization
    if (!entity_properties.entity_id) {
      entity_properties.entity_id = uuid()
      log(`Generated new entity_id: ${entity_properties.entity_id}`)
    }

    // Prepare the frontmatter with base entity fields
    const frontmatter = format_entity_properties_to_frontmatter({
      entity_properties,
      entity_type
    })

    // Use the new document writer function with the formatted frontmatter
    await write_document_to_filesystem({
      absolute_path,
      document_properties: frontmatter,
      document_content: entity_content
    })

    // Format the written file with Prettier for consistent formatting
    await format_markdown_file_with_prettier({ absolute_path })

    log(`Successfully wrote ${entity_type} entity to ${absolute_path}`)
    return {
      success: true,
      entity_id: entity_properties.entity_id
    }
  } catch (error) {
    log(`Error writing entity to filesystem at ${absolute_path}:`, error)
    throw error
  }
}
