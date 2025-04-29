import debug from 'debug'
import path from 'path'
import fs from 'fs/promises'

import db from '#db'
import { entity_registry } from '../shared/entity-registry.mjs'
import { with_transaction } from '../shared/db-utils.mjs'
import { parse_json_if_possible } from '../shared/frontmatter-utils.mjs'
import { add_all_entity_relationships } from './relation-formatter.mjs'
import { write_markdown_entity } from '../file-operations/write.mjs'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'

const log = debug('markdown:entity_export')

/**
 * Export a markdown entity from database to file
 *
 * @param {Object} params Function parameters
 * @param {String} params.entity_id ID of the entity to export
 * @param {String} params.user_base_directory Base directory for user data
 * @param {Boolean} params.overwrite If true, overwrites existing files
 * @returns {Object} Result with the file path and status
 */
export async function export_markdown_entity({
  entity_id,
  user_base_directory,
  overwrite = false
}) {
  try {
    log(`Exporting entity ${entity_id} to markdown file`)

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
    const absolute_path = path.join(type_dir, file_name)

    // Check if file exists and handle overwrite
    const file_exists = await file_exists_in_filesystem({ absolute_path })
    if (file_exists && !overwrite) {
      return {
        success: false,
        message: `File already exists: ${absolute_path}`,
        file_path: absolute_path
      }
    }

    // Prepare frontmatter
    let frontmatter = entity.frontmatter || {}

    // If stored as string, parse it
    if (typeof frontmatter === 'string') {
      frontmatter = parse_json_if_possible('frontmatter', frontmatter)
    }

    // Ensure required frontmatter fields
    frontmatter.title = entity.title
    frontmatter.type = entity.type

    if (entity.description) {
      frontmatter.description = entity.description
    }

    // Fetch type-specific data and relations using transaction
    await with_transaction(async (trx) => {
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

      // Fetch and add all related entities (relations, tags, observations)
      await add_all_entity_relationships(entity_id, frontmatter)
    })

    // Write the file
    const content = entity.markdown || entity.content || ''
    await write_markdown_entity({
      absolute_path,
      frontmatter,
      content
    })

    return {
      success: true,
      absolute_path,
      entity_id: entity.entity_id
    }
  } catch (error) {
    log('Error exporting entity to markdown file:', error)
    throw error
  }
}

/**
 * Batch export multiple entities to markdown files
 *
 * @param {Object} params Function parameters
 * @param {Array} params.entity_ids Array of entity IDs to export
 * @param {String} params.user_base_directory Base directory for user data
 * @param {Boolean} params.overwrite If true, overwrites existing files
 * @returns {Object} Results with success count and errors
 */
export async function batch_export_markdown_entities({
  entity_ids,
  user_base_directory,
  overwrite = false
}) {
  const results = {
    total: entity_ids.length,
    success: 0,
    skipped: 0,
    errors: []
  }

  for (const entity_id of entity_ids) {
    try {
      const result = await export_markdown_entity({
        entity_id,
        user_base_directory,
        overwrite
      })

      if (result.success) {
        results.success++
      } else {
        results.skipped++
      }
    } catch (error) {
      results.errors.push({
        entity_id,
        message: error.message
      })
    }
  }

  return results
}

export default {
  export_markdown_entity,
  batch_export_markdown_entities
}
