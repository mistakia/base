import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-activity')

/**
 * Write an activity entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.activity_properties Activity properties
 * @param {string} params.activity_properties.title Title of the activity (required)
 * @param {string} [params.activity_properties.description=''] Description of the activity
 * @param {string} [params.activity_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.activity_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.activity_properties.tags=[]] Tags to associate with the activity
 * @param {string[]} [params.activity_properties.observations=[]] Array of structured observations
 * @param {Date} [params.activity_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.activity_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.activity_properties.archived_at=null] Date when the activity was archived
 * @param {string} params.user_id User ID who owns the activity
 * @param {string} [params.activity_content=''] Optional activity content/markdown
 * @param {string} [params.activity_id=null] Optional activity ID for updates
 * @param {Object} [params.file_info=null] Optional file information
 * @param {string} [params.file_info.absolute_path=null] Absolute path to the file
 * @param {string} [params.file_info.git_sha=null] Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<string>} The activity_id (same as entity_id)
 */
export async function write_activity_to_database({
  activity_properties,
  user_id,
  activity_content = '',
  activity_id = null,
  file_info = null,
  trx = null
}) {
  try {
    log('Writing activity to database')
    const db_client = trx || db

    // First write the base entity
    const entity_id = await write_entity_to_database({
      entity_properties: activity_properties,
      entity_type: 'activity',
      user_id,
      entity_content: activity_content,
      entity_id: activity_id,
      file_info,
      trx: db_client
    })

    // Process activity-specific data directly
    await write_activity_data_to_database({
      entity_id,
      db_client
    })

    log(`Activity successfully written with ID: ${entity_id}`)
    return entity_id
  } catch (error) {
    log('Error writing activity to database:', error)
    throw error
  }
}

/**
 * Write activity-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_activity_data_to_database({ entity_id, db_client }) {
  log(`Writing activity data for entity: ${entity_id}`)

  // Per schema.sql, activities table only has entity_id field
  const activity_data = {
    entity_id
  }

  // Upsert activity data
  await db_client('activities')
    .insert(activity_data)
    .onConflict('entity_id')
    .merge()

  log(`Activity data written successfully for entity: ${entity_id}`)
}

export default write_activity_to_database
