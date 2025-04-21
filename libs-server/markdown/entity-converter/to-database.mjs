import debug from 'debug'
import path from 'path'
import db from '#db'
import { process_markdown_entity } from '../index.mjs'
import { read_file_from_ref } from '../../git/index.mjs'
import { entity_registry, relation_handlers } from './index.mjs'

const log = debug('markdown:entity_converter:to_database')

/**
 * Generate database entries from an entity file path
 * @param {Object} params Function parameters
 * @param {String} params.file_path Path to the entity file
 * @param {String} params.user_id User ID for the entity
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.ref Git reference (branch, commit) - defaults to 'main'
 * @param {Boolean} params.dry_run If true, returns the data that would be inserted without actually inserting
 * @returns {Object} Entity details including entity_id if inserted
 */
export async function generate_database_from_entity_file({
  file_path,
  user_id,
  repo_path,
  ref = 'main',
  dry_run = false
}) {
  try {
    log(`Reading entity file from ${ref}:${file_path}`)

    // Read file from git reference
    const content = await read_file_from_ref({
      repo_path,
      ref,
      file_path
    })

    if (!content) {
      throw new Error(`File not found or empty: ${file_path}`)
    }

    // Get absolute path for the file
    const absolute_path = path.resolve(path.join(repo_path, file_path))

    // Process the entity
    const file_info = {
      file_path,
      absolute_path,
      git_sha: ref // This is not the actual git SHA, but used for tracking the reference
    }

    const processed_data = await process_markdown_entity(content, file_info)

    if (!processed_data.validation.valid) {
      throw new Error(
        `Invalid entity file: ${processed_data.validation.errors.join(', ')}`
      )
    }

    const {
      frontmatter,
      markdown,
      content: parsed_content,
      type,
      extracted
    } = processed_data

    // Ensure frontmatter is valid for serialization
    const cleaned_frontmatter = {}
    Object.keys(frontmatter).forEach((key) => {
      if (frontmatter[key] !== undefined && frontmatter[key] !== null) {
        // Handle arrays specifically for PostgreSQL
        if (Array.isArray(frontmatter[key])) {
          if (frontmatter[key].length > 0) {
            cleaned_frontmatter[key] = frontmatter[key]
          }
        } else {
          cleaned_frontmatter[key] = frontmatter[key]
        }
      }
    })

    // Prepare entity data
    const entity_data = {
      title: frontmatter.title || path.basename(file_path, '.md'),
      type,
      description: frontmatter.description || '',
      user_id,
      markdown,
      content: parsed_content,
      frontmatter: cleaned_frontmatter,
      file_path: absolute_path,
      git_sha: file_info.git_sha
    }

    // If dry run, just return what would be inserted
    if (dry_run) {
      return {
        entity_data,
        extracted
      }
    }

    // Check if entity already exists
    const existing = await db('entities')
      .where({
        file_path: absolute_path,
        user_id
      })
      .first()

    // Start transaction
    return db.transaction(async (trx) => {
      let entity_id

      if (existing) {
        // Update existing entity
        entity_data.updated_at = new Date()
        await trx('entities')
          .where({ entity_id: existing.entity_id })
          .update(entity_data)

        entity_id = existing.entity_id
        log(`Updated entity: ${entity_data.title}`)
      } else {
        // Create new entity
        const now = new Date()
        entity_data.created_at = now
        entity_data.updated_at = now

        const [new_entity] = await trx('entities')
          .insert(entity_data)
          .returning('entity_id')

        entity_id = new_entity.entity_id
        log(`Created new entity: ${entity_data.title}`)
      }

      // Handle type-specific data using the entity registry
      if (entity_registry[type]) {
        const type_handler = entity_registry[type].handle

        // For database types, pass the specific type as an extra parameter
        if (['database', 'database_item', 'database_view'].includes(type)) {
          await type_handler(trx, entity_id, frontmatter, type)
        } else {
          await type_handler(trx, entity_id, frontmatter)
        }
      } else {
        log(`No specific handling for entity type: ${type}`)
      }

      // Handle extracted relations
      await relation_handlers.handle(trx, entity_id, user_id, extracted)

      return {
        entity_id,
        title: entity_data.title,
        type
      }
    })
  } catch (error) {
    log('Error generating database from entity file:', error)
    throw error
  }
}
