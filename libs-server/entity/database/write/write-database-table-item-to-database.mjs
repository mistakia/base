import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-database-table-item')

/**
 * Write a database table item entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.database_item_properties Database item properties object
 * @param {string} params.database_item_properties.title Item name (required)
 * @param {string} params.database_item_properties.database_table_id Parent database table ID (required)
 * @param {string} [params.database_item_properties.description=''] Item description
 * @param {string} [params.database_item_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.database_item_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.database_item_properties.tags=[]] Tags to associate with the item
 * @param {string[]} [params.database_item_properties.observations=[]] Array of structured observations
 * @param {Object} [params.database_item_properties.field_values={}] Field values of the database item
 * @param {Date} [params.database_item_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.database_item_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.database_item_properties.archived_at=null] Date when the item was archived
 * @param {string} params.user_id User ID who owns the item entity
 * @param {string} [params.database_item_content=''] Optional item content/markdown
 * @param {string} [params.database_item_id=null] Optional item ID for updates
 * @param {string} [params.absolute_path=null] Absolute path to the file
 * @param {string} [params.base_relative_path=null] Base relative path to the file
 * @param {string} [params.git_sha=null] Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @param {string} [params.root_base_directory=null] Root base directory of the repository
 * @param {Object} [params.formatted_entity_metadata] Formatted entity metadata
 * @returns {Promise<string>} The database_item_id (same as entity_id)
 */
export async function write_database_table_item_to_database({
  database_item_properties,
  user_id,
  database_item_content = '',
  entity_id = null,
  absolute_path,
  base_relative_path,
  git_sha,
  trx = null,
  root_base_directory,
  formatted_entity_metadata
}) {
  try {
    log('Writing database table item to database')
    const db_client = trx || db

    // Validate required item properties
    if (!database_item_properties.database_table_id) {
      throw new Error('Database table ID is required for a database table item')
    }

    // Extract field values if present and not directly in database_item_properties
    const field_values = database_item_properties.field_values || {}

    // First write the base entity
    const result_entity_id = await write_entity_to_database({
      entity_properties: database_item_properties,
      entity_type: 'database_item',
      user_id,
      entity_content: database_item_content,
      entity_id,
      absolute_path,
      base_relative_path,
      git_sha,
      trx: db_client,
      root_base_directory,
      formatted_entity_metadata
    })

    // Process database item-specific data
    await write_database_table_item_data_to_database({
      entity_id: result_entity_id,
      database_table_id: database_item_properties.database_table_id,
      field_values,
      db_client
    })

    log(`Database table item successfully written with ID: ${result_entity_id}`)
    return result_entity_id
  } catch (error) {
    log('Error writing database table item to database:', error)
    throw error
  }
}

/**
 * Write database table item-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {string} params.database_table_id Parent database table ID
 * @param {Object} params.field_values Field values of the database item
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_database_table_item_data_to_database({
  entity_id,
  database_table_id,
  field_values,
  db_client
}) {
  log(`Writing database table item data for entity: ${entity_id}`)

  // Process database table item-specific data
  const database_table_item_data = {
    entity_id,
    database_table_id,
    field_values
  }

  // Upsert database table item data
  await db_client('database_table_items')
    .insert(database_table_item_data)
    .onConflict('entity_id')
    .merge()

  log(`Database table item data written successfully for entity: ${entity_id}`)
}

export default write_database_table_item_to_database
