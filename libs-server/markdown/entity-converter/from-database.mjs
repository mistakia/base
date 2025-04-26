import debug from 'debug'
import path from 'path'
import fs from 'fs/promises'
import db from '#db'
import { write_markdown_entity } from '../index.mjs'
import { entity_registry, relation_handlers } from './index.mjs'

const log = debug('markdown:entity_converter:from_database')

/**
 * Generate an entity file from a database entry
 * @param {Object} params Function parameters
 * @param {String} params.entity_id ID of the entity to convert to file
 * @param {String} params.user_base_directory Base directory for user data
 * @param {Boolean} params.overwrite If true, overwrites existing files
 * @returns {Object} Result with the file path and status
 */
export async function generate_entity_file_from_database({
  entity_id,
  user_base_directory,
  overwrite = false
}) {
  try {
    log(`Generating entity file from database for entity ${entity_id}`)

    // Fetch the entity from database
    const entity = await db('entities').where({ entity_id }).first()

    if (!entity) {
      throw new Error(`Entity not found: ${entity_id}`)
    }

    // Determine file path based on entity type and ID
    const type_dir = path.join(user_base_directory, entity.type)

    // Ensure the directory exists
    try {
      await fs.mkdir(type_dir, { recursive: true })
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err
      }
    }

    const file_name = `${entity.title.replace(/[^a-zA-Z0-9_-]/g, '-')}-${entity_id.substring(0, 8)}.md`
    const full_path = path.join(type_dir, file_name)

    // Check if file exists and handle overwrite
    try {
      await fs.access(full_path)
      if (!overwrite) {
        return {
          success: false,
          message: `File already exists: ${full_path}`,
          file_path: full_path
        }
      }
    } catch (err) {
      // File does not exist, we can proceed
    }

    // Prepare frontmatter
    let frontmatter = entity.frontmatter || {}

    // If stored as string, parse it
    if (typeof frontmatter === 'string') {
      try {
        frontmatter = JSON.parse(frontmatter)
      } catch (err) {
        log('Error parsing frontmatter JSON:', err)
        frontmatter = {}
      }
    }

    // Ensure required frontmatter fields
    frontmatter.title = entity.title
    frontmatter.type = entity.type

    if (entity.description) {
      frontmatter.description = entity.description
    }

    // Fetch type-specific data using the entity registry
    if (entity_registry[entity.type]) {
      const type_fetcher = entity_registry[entity.type].fetch

      // For database types, pass the specific type as an extra parameter
      if (
        ['database', 'database_item', 'database_view'].includes(entity.type)
      ) {
        await type_fetcher(entity_id, frontmatter, entity.type)
      } else {
        await type_fetcher(entity_id, frontmatter)
      }
    } else {
      log(`No specific data fetching for entity type: ${entity.type}`)
    }

    // Add entity_id to frontmatter for reference
    frontmatter.entity_id = entity_id

    // Fetch related entities
    await relation_handlers.add(entity_id, frontmatter)

    // Write the file
    const content = entity.markdown || entity.content || ''
    await write_markdown_entity({ file_path: full_path, frontmatter, content })

    return {
      success: true,
      file_path: full_path,
      entity_id: entity.entity_id
    }
  } catch (error) {
    log('Error generating entity file from database:', error)
    throw error
  }
}
