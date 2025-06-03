import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-database-table-view')

/**
 * Write a database table view entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.database_view_properties Database view properties object
 * @param {string} params.database_view_properties.title View name (required)
 * @param {string} params.database_view_properties.view_name View name (required)
 * @param {string} params.database_view_properties.table_name Associated table name (required)
 * @param {string} params.database_view_properties.database_table_entity_id Entity ID of the database table (required)
 * @param {string} [params.database_view_properties.description=''] View description
 * @param {string} [params.database_view_properties.view_description=null] Description of this view
 * @param {string} [params.database_view_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.database_view_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.database_view_properties.tags=[]] Tags to associate with the view
 * @param {string[]} [params.database_view_properties.observations=[]] Array of structured observations
 * @param {Object} [params.database_view_properties.table_state=null] JSON configuration of view settings
 * @param {Date} [params.database_view_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.database_view_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.database_view_properties.archived_at=null] Date when the view was archived
 * @param {string} params.user_id User ID who owns the view entity
 * @param {string} [params.database_view_content=''] Optional view content/markdown
 * @param {string} [params.entity_id=null] Optional entity ID for updates
 * @param {string} params.absolute_path Absolute path to the file
 * @param {string} params.base_relative_path Base relative path to the file
 * @param {string} params.git_sha Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @param {string} [params.root_base_directory=null] Root base directory of the repository
 * @returns {Promise<string>} The entity_id
 */
export async function write_database_table_view_to_database({
  database_view_properties,
  user_id,
  database_view_content = '',
  entity_id = null,
  absolute_path,
  base_relative_path,
  git_sha,
  trx = null,
  root_base_directory
}) {
  try {
    log('Writing database table view to database')
    const db_client = trx || db

    // Validate required view properties
    if (!database_view_properties.view_name) {
      throw new Error('View name is required for a database table view')
    }

    if (!database_view_properties.table_name) {
      throw new Error('Table name is required for a database table view')
    }

    if (!database_view_properties.database_table_entity_id) {
      throw new Error(
        'Database table entity ID is required for a database table view'
      )
    }

    // First write the base entity
    const result_entity_id = await write_entity_to_database({
      entity_properties: database_view_properties,
      entity_type: 'database_view',
      user_id,
      entity_content: database_view_content,
      entity_id,
      absolute_path,
      base_relative_path,
      git_sha,
      trx: db_client,
      root_base_directory
    })

    // Process database view-specific data
    await write_database_table_view_data_to_database({
      entity_id: result_entity_id,
      view_name: database_view_properties.view_name,
      view_description: database_view_properties.view_description,
      database_table_name: database_view_properties.table_name,
      database_table_entity_id:
        database_view_properties.database_table_entity_id,
      table_state: database_view_properties.table_state,
      db_client
    })

    log(`Database table view successfully written with ID: ${result_entity_id}`)
    return result_entity_id
  } catch (error) {
    log('Error writing database table view to database:', error)
    throw error
  }
}

/**
 * Write database table view-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {string} params.view_name Name of the view
 * @param {string} [params.view_description=null] Description of this view
 * @param {string} params.database_table_name Associated table name
 * @param {string} params.database_table_entity_id Entity ID of the database table
 * @param {Object} [params.table_state=null] JSON configuration of view settings
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_database_table_view_data_to_database({
  entity_id,
  view_name,
  view_description = null,
  database_table_name,
  database_table_entity_id,
  table_state = null,
  db_client
}) {
  log(`Writing database table view data for entity: ${entity_id}`)

  // Process database table view-specific data
  const database_table_view_data = {
    entity_id,
    view_name,
    view_description,
    database_table_name,
    database_table_entity_id,
    table_state
  }

  // Upsert database table view data
  await db_client('database_table_views')
    .insert(database_table_view_data)
    .onConflict('entity_id')
    .merge()

  log(`Database table view data written successfully for entity: ${entity_id}`)
}

export default write_database_table_view_to_database
