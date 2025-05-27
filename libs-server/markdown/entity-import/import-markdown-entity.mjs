import postgres from '#db'
import path from 'path'
import debug from 'debug'

import { clean_frontmatter } from '../shared/frontmatter-utils.mjs'
import { with_transaction } from '#libs-server/utils/with-transaction.mjs'
import { entity_registry } from '../shared/entity-registry.mjs'
import { process_entity_relations } from './relation-handler.mjs'

const log = debug('markdown:entity_import')

/**
 * Import or update markdown entity in database
 * @param {Object} formatted_markdown_entity Formatted markdown entity
 * @param {Object} file_info File metadata
 * @param {String} user_id User ID
 * @param {Object} options Additional options
 * @returns {String} Entity ID
 */
export async function import_markdown_entity(
  formatted_markdown_entity,
  file_info,
  user_id,
  options = {}
) {
  // Validate inputs
  if (
    !formatted_markdown_entity ||
    typeof formatted_markdown_entity !== 'object'
  ) {
    throw new Error('formatted_markdown_entity must be an object')
  }

  if (!file_info || typeof file_info !== 'object') {
    throw new Error('file_info must be an object')
  }

  if (!user_id) {
    throw new Error('user_id must be provided')
  }

  const { frontmatter, markdown, content, type, entity_metadata } =
    formatted_markdown_entity

  // Check if entity exists by file path
  const existing = await postgres('entities')
    .where({
      file_path: file_info.absolute_path,
      user_id
    })
    .first()

  // Clean frontmatter for database storage
  const cleaned_frontmatter = clean_frontmatter(frontmatter)

  // Prepare entity data
  const entity_data = {
    title: frontmatter.title || path.basename(file_info.file_path, '.md'),
    type,
    description: frontmatter.description || '',
    user_id,
    markdown,
    content,
    frontmatter: JSON.stringify(cleaned_frontmatter),
    file_path: file_info.absolute_path,
    git_sha: file_info.git_sha
  }

  // Step 1: Insert/update entity in its own transaction
  let entity_id
  await with_transaction(async (trx) => {
    // Insert or update based on whether it exists
    if (existing) {
      // Only update if git sha is different
      if (existing.git_sha !== file_info.git_sha) {
        entity_data.updated_at = new Date()
        await trx('entities')
          .where({ entity_id: existing.entity_id })
          .update(entity_data)

        entity_id = existing.entity_id
        log(`Updated entity: ${entity_data.title}`)
      } else {
        entity_id = existing.entity_id
        log(`Entity unchanged: ${entity_data.title}`)
        // Early return, nothing else to do
        return entity_id
      }
    } else {
      // Insert new entity
      const now = new Date()
      entity_data.created_at = now
      entity_data.updated_at = now
      const [new_entity] = await trx('entities')
        .insert(entity_data)
        .returning('entity_id')

      entity_id = new_entity.entity_id
      log(`Created new entity: ${entity_data.title}`)
    }
  })

  // Step 2: Call handler and process relations in a new transaction
  if (entity_metadata) {
    await with_transaction(async (trx) => {
      // Handle type-specific data using entity registry
      if (entity_registry[type]) {
        const handler = entity_registry[type].handle

        // For database types, pass the specific type as an extra parameter
        if (['database', 'database_item', 'database_view'].includes(type)) {
          await handler(trx, entity_id, frontmatter, type)
        } else {
          await handler(trx, entity_id, frontmatter)
        }
      }

      // Process relations, tags, and observations
      await process_entity_relations(trx, entity_id, user_id, entity_metadata)
    })
  }

  return entity_id
}

export default {
  import_markdown_entity
}
