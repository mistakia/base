import postgres from '#db'
import path from 'path'
import { process_markdown_entity } from './index.mjs'
import debug from 'debug'

const log = debug('markdown:importer')

/**
 * Import or update markdown entity in database
 * @param {Object} parsed_data Parsed markdown data
 * @param {Object} file_info File metadata
 * @param {String} user_id User ID
 * @param {Object} options Additional options
 * @returns {String} Entity ID
 */
export async function import_markdown_entity(
  parsed_data,
  file_info,
  user_id,
  options = {}
) {
  // Validate inputs
  if (!parsed_data || typeof parsed_data !== 'object') {
    throw new Error('parsed_data must be an object')
  }

  if (!file_info || typeof file_info !== 'object') {
    throw new Error('file_info must be an object')
  }

  if (!user_id) {
    throw new Error('user_id must be provided')
  }

  const { frontmatter, markdown, content, type, extracted } = parsed_data

  // Process the markdown entity if not already processed
  const processed_data = extracted
    ? parsed_data
    : await process_markdown_entity(content, file_info, options.schemas || {})

  // Check if entity exists by file path
  const existing = await postgres('entities')
    .where({
      file_path: file_info.absolute_path,
      user_id
    })
    .first()

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

  let entity_id

  // Begin transaction
  const trx = await postgres.transaction()

  try {
    // Insert or update based on whether it exists
    if (existing) {
      // Only update if git sha is different or force_update is true
      if (existing.git_sha !== file_info.git_sha || options.force_update) {
        entity_data.updated_at = new Date()
        await trx('entities')
          .where({ entity_id: existing.entity_id })
          .update(entity_data)

        entity_id = existing.entity_id
        log(`Updated entity: ${entity_data.title}`)
      } else {
        entity_id = existing.entity_id
        log(`Entity unchanged: ${entity_data.title}`)
        await trx.commit()
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

    // If we have extracted data from the JS processor, use it instead of relying on DB triggers
    if (processed_data.extracted) {
      // Handle tags
      if (
        processed_data.extracted.tags &&
        processed_data.extracted.tags.length > 0
      ) {
        // Clear existing tags
        await trx('entity_tags').where({ entity_id }).delete()

        // Collect all tag names for batch processing
        const tag_names = processed_data.extracted.tags.map((tag) => tag.name)

        // First, find all existing tags in one query
        const existing_tags = await trx('entities')
          .join('tags', 'entities.entity_id', 'tags.entity_id')
          .where({
            'entities.user_id': user_id,
            'entities.type': 'tag'
          })
          .whereIn('entities.title', tag_names)
          .select(['entities.entity_id', 'entities.title'])

        // Create a map of tag name to entity_id for quick lookup
        const tag_map = {}
        existing_tags.forEach((tag) => {
          tag_map[tag.title] = tag.entity_id
        })

        // Determine which tags need to be created
        const tags_to_create = tag_names.filter((name) => !tag_map[name])

        // Batch create new tags if needed
        const new_tag_ids = []
        if (tags_to_create.length > 0) {
          // Prepare batch insert data
          const now = new Date()
          const tag_entities_to_insert = tags_to_create.map((name) => ({
            title: name,
            type: 'tag',
            description: `Tag: ${name}`,
            user_id,
            created_at: now,
            updated_at: now
          }))

          // Insert all new tag entities at once
          const inserted_tags = await trx('entities')
            .insert(tag_entities_to_insert)
            .returning(['entity_id', 'title'])

          // Update our tag map and prepare data for tags table
          const tags_table_data = []
          inserted_tags.forEach((tag) => {
            tag_map[tag.title] = tag.entity_id
            tags_table_data.push({ entity_id: tag.entity_id })
            new_tag_ids.push(tag.entity_id)
          })

          // Batch insert into tags table
          if (tags_table_data.length > 0) {
            await trx('tags').insert(tags_table_data)
          }
        }

        // Prepare data for entity_tags linking table
        const entity_tags_data = tag_names.map((name) => ({
          entity_id,
          tag_entity_id: tag_map[name]
        }))

        // Batch insert entity-tag relationships
        if (entity_tags_data.length > 0) {
          await trx('entity_tags')
            .insert(entity_tags_data)
            .onConflict(['entity_id', 'tag_entity_id'])
            .ignore()
        }
      }

      // Handle relations
      if (
        processed_data.extracted.relations &&
        processed_data.extracted.relations.length > 0
      ) {
        // Clear existing relations from the relations frontmatter field
        await trx('entity_relations')
          .where({ source_entity_id: entity_id })
          .whereNotExists(function () {
            this.select('*')
              .from('entity_relations')
              .whereRaw(
                'entity_relations.source_entity_id = entity_relations.source_entity_id'
              )
          })
          .delete()

        // Get all target titles to find matching entities in one query
        const target_titles = processed_data.extracted.relations.map(
          (relation) => relation.target_title
        )

        // Batch find all target entities
        const target_entities = await trx('entities')
          .where({ user_id })
          .whereIn('title', target_titles)
          .select(['entity_id', 'title'])

        // Create a map of title to entity_id for quick lookup
        const entity_map = {}
        target_entities.forEach((entity) => {
          entity_map[entity.title] = entity.entity_id
        })

        // Prepare batched inserts
        const relations_with_targets = []

        processed_data.extracted.relations.forEach((relation) => {
          if (entity_map[relation.target_title]) {
            relations_with_targets.push({
              source_entity_id: entity_id,
              target_entity_id: entity_map[relation.target_title],
              relation_type: relation.relation_type,
              context: relation.context,
              created_at: new Date()
            })
          } else {
            // Skip relations without target entities since we can't store them without target_entity_id
            log(
              `Warning: Could not find target entity with title: ${relation.target_title}`
            )
          }
        })

        // Batch insert relations with targets
        if (relations_with_targets.length > 0) {
          await trx('entity_relations')
            .insert(relations_with_targets)
            .onConflict([
              'source_entity_id',
              'target_entity_id',
              'relation_type'
            ])
            .merge()
        }
      }

      // Handle frontmatter relations
      if (
        processed_data.extracted.frontmatter_relations &&
        processed_data.extracted.frontmatter_relations.length > 0
      ) {
        // Get all unique relation types for deletion
        const relation_types = [
          ...new Set(
            processed_data.extracted.frontmatter_relations.map(
              (r) => r.relation_type
            )
          )
        ]

        // Clear existing frontmatter relations
        await trx('entity_relations')
          .where({ source_entity_id: entity_id })
          .whereIn('relation_type', relation_types)
          .delete()

        // Get all target titles to find matching entities in one query
        const target_titles =
          processed_data.extracted.frontmatter_relations.map(
            (relation) => relation.target_title
          )

        // Batch find all target entities
        const target_entities = await trx('entities')
          .where({ user_id })
          .whereIn('title', target_titles)
          .select(['entity_id', 'title'])

        // Create a map of title to entity_id for quick lookup
        const entity_map = {}
        target_entities.forEach((entity) => {
          entity_map[entity.title] = entity.entity_id
        })

        // Prepare batched inserts
        const relations_with_targets = []

        processed_data.extracted.frontmatter_relations.forEach((relation) => {
          if (entity_map[relation.target_title]) {
            relations_with_targets.push({
              source_entity_id: entity_id,
              target_entity_id: entity_map[relation.target_title],
              relation_type: relation.relation_type,
              created_at: new Date()
            })
          } else {
            // Skip relations without target entities since we can't store them without target_entity_id
            log(
              `Warning: Could not find target entity with title: ${relation.target_title}`
            )
          }
        })

        // Batch insert relations with targets
        if (relations_with_targets.length > 0) {
          await trx('entity_relations')
            .insert(relations_with_targets)
            .onConflict([
              'source_entity_id',
              'target_entity_id',
              'relation_type'
            ])
            .merge()
        }
      }
    }

    // Commit transaction
    await trx.commit()
    return entity_id
  } catch (error) {
    // Rollback on error
    await trx.rollback()
    log('Error importing markdown entity:', error)
    throw error
  }
}

/**
 * Remove stale entities (entities that no longer exist in the repository)
 * @param {Array} current_files Array of current file paths
 * @param {String} user_id User ID
 * @returns {Number} Number of removed entities
 */
export async function remove_stale_entities(current_files, user_id) {
  try {
    // Get absolute paths of all current files
    const absolute_paths = current_files.map((file) => file.absolute_path)

    // Find entities that are not in the current files
    const stale_entities = await postgres('entities')
      .where({ user_id })
      .whereNotNull('file_path')
      .whereNotIn('file_path', absolute_paths)
      .whereNull('archived_at')
      .select('entity_id', 'title')

    if (stale_entities.length === 0) {
      log('No stale entities found')
      return 0
    }

    // Mark entities as archived
    const now = new Date()
    const entity_ids = stale_entities.map((e) => e.entity_id)

    await postgres('entities')
      .whereIn('entity_id', entity_ids)
      .update({ archived_at: now })

    log(`Archived ${stale_entities.length} stale entities`)
    return stale_entities.length
  } catch (error) {
    log('Error removing stale entities:', error)
    throw error
  }
}

export default {
  import_markdown_entity,
  remove_stale_entities
}
