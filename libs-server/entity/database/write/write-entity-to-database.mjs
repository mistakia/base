import db from '#db'
import debug from 'debug'
import { write_entity_relations_to_database } from './write-entity-relations-to-database.mjs'
import { write_entity_tags_to_database } from './write-entity-tags-to-database.mjs'

const log = debug('entity:database:write')

/**
 * Creates or updates an entity in the database
 *
 * @param {Object} params Entity creation parameters
 * @param {Object} params.entity_properties Properties of the entity
 * @param {string} params.entity_properties.title Title of the entity
 * @param {string} [params.entity_properties.description=''] Description of the entity
 * @param {string} [params.entity_properties.permalink=null] Custom URL path
 * @param {string[]} [params.entity_properties.tags=[]] Array of categorization tags
 * @param {Object} [params.entity_properties.relations={}] Relations to other entities
 * @param {string[]} [params.entity_properties.observations=[]] Array of structured observations
 * @param {string} params.entity_type Type of entity (task, guideline, activity, etc.)
 * @param {string} params.user_id User who owns the entity
 * @param {string} [params.entity_content=''] Optional entity content/markdown
 * @param {string} [params.entity_id=null] Optional entity ID for updates
 * @param {Object} [params.file_info=null] Optional file information
 * @param {Object} [params.file_info.absolute_path=null] Absolute path to the file
 * @param {Object} [params.file_info.git_sha=null] Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<string>} The entity_id
 */
export async function write_entity_to_database({
  entity_properties,
  entity_type,
  user_id,
  entity_content = '',
  entity_id = null,
  file_info = null,
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

    const db_client = trx || db

    // Prepare base entity data
    const entity_data = {
      title: entity_properties.title || 'Untitled',
      description: entity_properties.description || '',
      type: entity_type,
      user_id,
      markdown: entity_content || null,
      frontmatter: JSON.stringify(entity_properties),
      updated_at: new Date()
    }

    // Add permalink if provided
    if (entity_properties.permalink) {
      entity_data.permalink = entity_properties.permalink
    }

    // Add file path and git SHA if provided
    if (file_info) {
      if (file_info.absolute_path) {
        entity_data.file_path = file_info.absolute_path
      }

      if (file_info.git_sha) {
        entity_data.git_sha = file_info.git_sha
      }
    }

    let result_entity_id

    // Update or insert based on whether entity_id exists
    if (entity_id) {
      // Update existing entity
      await db_client('entities').where({ entity_id }).update(entity_data)

      result_entity_id = entity_id
      log(`Updated entity in database: ${entity_id}`)
    } else {
      // Insert new entity
      // Use created_at from entity_properties if it exists, otherwise use current time
      entity_data.created_at = entity_properties.created_at || new Date()

      const [new_entity] = await db_client('entities')
        .insert(entity_data)
        .returning('entity_id')

      result_entity_id = new_entity.entity_id
      log(`Created new entity in database: ${result_entity_id}`)
    }

    // Process relations if present in entity_properties
    if (entity_properties.relations) {
      await write_entity_relations_to_database({
        entity_id: result_entity_id,
        relations: entity_properties.relations,
        user_id,
        db_client
      })
    }

    // Process tags if present in entity_properties
    if (entity_properties.tags) {
      await write_entity_tags_to_database({
        entity_id: result_entity_id,
        tags: entity_properties.tags,
        db_client
      })
    }

    // Handle archived status if present
    if (entity_properties.archived_at) {
      await db_client('entities')
        .where({ entity_id: result_entity_id })
        .update({ archived_at: entity_properties.archived_at })
    }

    return result_entity_id
  } catch (error) {
    log('Error writing entity to database:', error)
    throw error
  }
}

export default write_entity_to_database
