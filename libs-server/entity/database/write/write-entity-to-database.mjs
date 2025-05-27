import db from '#db'
import debug from 'debug'
import { write_entity_relations_to_database } from './write-entity-relations-to-database.mjs'
import { write_entity_tags_to_database } from './write-entity-tags-to-database.mjs'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'

const log = debug('entity:database:write')

/**
 * Creates or updates an entity in the database
 *
 * @param {Object} params Entity creation parameters
 * @param {Object} params.entity_properties Properties of the entity
 * @param {string} params.entity_properties.title Title of the entity
 * @param {string} params.entity_properties.entity_id ID of the entity
 * @param {string} [params.entity_properties.description=''] Description of the entity
 * @param {string} [params.entity_properties.permalink=null] Custom URL path
 * @param {string[]} [params.entity_properties.tags=[]] Array of categorization tags
 * @param {Object} [params.entity_properties.relations={}] Relations to other entities
 * @param {string[]} [params.entity_properties.observations=[]] Array of structured observations
 * @param {string} params.entity_type Type of entity (task, guideline, activity, etc.)
 * @param {string} params.user_id User who owns the entity
 * @param {string} [params.entity_content=''] Optional entity content/markdown
 * @param {string} params.absolute_path Absolute path to the file (required)
 * @param {string} params.base_relative_path Path relative to repository base (required)
 * @param {string} params.git_sha Git SHA of the file (required)
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<string>} The entity_id
 */
export async function write_entity_to_database({
  entity_properties,
  entity_type,
  user_id,
  entity_content = '',
  absolute_path,
  base_relative_path,
  git_sha,
  trx = null
}) {
  try {
    log(`Writing ${entity_type} entity to database`)

    if (!entity_properties || typeof entity_properties !== 'object') {
      throw new Error('Entity properties must be a valid object')
    }

    if (!entity_type) {
      throw new Error('Entity type is required')
    }

    if (!user_id) {
      throw new Error('User ID is required')
    }

    if (!entity_properties.entity_id) {
      throw new Error('entity_properties.entity_id is required')
    }

    if (!absolute_path) {
      throw new Error('absolute_path is required')
    }
    if (!base_relative_path) {
      throw new Error('base_relative_path is required')
    }
    if (!git_sha) {
      throw new Error('git_sha is required')
    }

    const db_client = trx || db

    // Prepare base entity data
    const entity_data = {
      title: entity_properties.title || 'Untitled',
      description: entity_properties.description || '',
      type: entity_type,
      user_id,
      markdown: entity_content || null,
      frontmatter: JSON.stringify(entity_properties),
      updated_at: entity_properties.updated_at || new Date(),
      absolute_path,
      base_relative_path,
      git_sha
    }

    // Add permalink if provided
    if (entity_properties.permalink) {
      entity_data.permalink = entity_properties.permalink
    }

    // Check if entity exists in database
    const existing_entity = await db_client('entities')
      .where({ entity_id: entity_properties.entity_id })
      .first()

    if (existing_entity) {
      // Update existing entity
      await db_client('entities')
        .where({ entity_id: entity_properties.entity_id })
        .update(entity_data)

      log(`Updated entity in database: ${entity_properties.entity_id}`)
    } else {
      // Insert with provided entity_id
      // Use created_at from entity_properties if it exists, otherwise use current time
      entity_data.created_at =
        entity_properties.created_at || entity_data.updated_at || new Date()
      entity_data.entity_id = entity_properties.entity_id

      await db_client('entities').insert(entity_data)
      log(
        `Created new entity in database with provided ID: ${entity_properties.entity_id}`
      )
    }

    // Process relations if present in entity_properties
    if (entity_properties.relations) {
      await write_entity_relations_to_database({
        entity_id: entity_properties.entity_id,
        relations: entity_properties.relations,
        user_id,
        db_client
      })
    }

    // Process tags if present in entity_properties
    if (entity_properties.tags) {
      // TODO convert base_relative_path to tag_entity_id
      await write_entity_tags_to_database({
        entity_id: entity_properties.entity_id,
        tag_entity_ids: entity_properties.tags,
        db_client
      })
    }

    // Handle archived status if present
    if (entity_properties.archived_at) {
      await db_client('entities')
        .where({ entity_id: entity_properties.entity_id })
        .update({ archived_at: entity_properties.archived_at })
    }

    return entity_properties.entity_id
  } catch (error) {
    log('Error writing entity to database:', error)
    throw error
  }
}

export default write_entity_to_database
