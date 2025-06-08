import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-digital-item')

/**
 * Write a digital item entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.digital_item_properties Digital item properties object
 * @param {string} params.digital_item_properties.title Item name (required)
 * @param {string} [params.digital_item_properties.description=''] Item description
 * @param {string} [params.digital_item_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.digital_item_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.digital_item_properties.tags=[]] Tags to associate with the item
 * @param {string[]} [params.digital_item_properties.observations=[]] Array of structured observations
 * @param {string} [params.digital_item_properties.file_mime_type=null] MIME type of the file
 * @param {string} [params.digital_item_properties.file_uri=null] URL or path to the file
 * @param {string} [params.digital_item_properties.file_size=null] Size of the file
 * @param {string} [params.digital_item_properties.file_cid=null] Content-based identifier for the file
 * @param {string} [params.digital_item_properties.text=null] Plain text content
 * @param {string} [params.digital_item_properties.html=null] HTML content if applicable
 * @param {Date} [params.digital_item_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.digital_item_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.digital_item_properties.archived_at=null] Date when the item was archived
 * @param {string} params.user_id User ID who owns the item entity
 * @param {string} [params.digital_item_content=''] Optional item content/markdown
 * @param {string} [params.entity_id=null] Optional entity ID for updates
 * @param {string} params.absolute_path Absolute path to the file
 * @param {string} params.base_uri Base relative path to the file
 * @param {string} params.git_sha Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @param {Object} [params.formatted_entity_metadata=null] Formatted entity metadata
 * @returns {Promise<string>} The entity_id
 */
export async function write_digital_item_to_database({
  digital_item_properties,
  user_id,
  digital_item_content = '',
  entity_id = null,
  absolute_path,
  base_uri,
  git_sha,
  trx = null,
  formatted_entity_metadata
}) {
  try {
    log('Writing digital item to database')
    const db_client = trx || db

    // First write the base entity
    const result_entity_id = await write_entity_to_database({
      entity_properties: digital_item_properties,
      entity_type: 'digital_item',
      user_id,
      entity_content: digital_item_content,
      entity_id,
      absolute_path,
      base_uri,
      git_sha,
      trx: db_client,
      formatted_entity_metadata
    })

    // Process digital item-specific data
    await write_digital_item_data_to_database({
      entity_id: result_entity_id,
      file_mime_type: digital_item_properties.file_mime_type,
      file_uri: digital_item_properties.file_uri,
      file_size: digital_item_properties.file_size,
      file_cid: digital_item_properties.file_cid,
      text: digital_item_properties.text,
      html: digital_item_properties.html,
      db_client
    })

    log(`Digital item successfully written with ID: ${result_entity_id}`)
    return result_entity_id
  } catch (error) {
    log('Error writing digital item to database:', error)
    throw error
  }
}

/**
 * Write digital item-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {string} [params.file_mime_type=null] MIME type of the file
 * @param {string} [params.file_uri=null] URL or path to the file
 * @param {string} [params.file_size=null] Size of the file
 * @param {string} [params.file_cid=null] Content-based identifier for the file
 * @param {string} [params.text=null] Plain text content
 * @param {string} [params.html=null] HTML content if applicable
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_digital_item_data_to_database({
  entity_id,
  file_mime_type = null,
  file_uri = null,
  file_size = null,
  file_cid = null,
  text = null,
  html = null,
  db_client
}) {
  log(`Writing digital item data for entity: ${entity_id}`)

  // Process digital item-specific data
  const digital_item_data = {
    entity_id,
    file_mime_type,
    file_uri,
    file_size,
    file_cid,
    text,
    html
  }

  // Upsert digital item data
  await db_client('digital_items')
    .insert(digital_item_data)
    .onConflict('entity_id')
    .merge()

  log(`Digital item data written successfully for entity: ${entity_id}`)
}

export default write_digital_item_to_database
