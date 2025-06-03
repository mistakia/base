import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-tag')

/**
 * Write a tag entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.tag_properties Tag properties object
 * @param {string} params.tag_properties.title Tag name (required)
 * @param {string} [params.tag_properties.description=''] Tag description
 * @param {string} [params.tag_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.tag_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.tag_properties.tags=[]] Tags to associate with this tag (meta-tagging)
 * @param {string[]} [params.tag_properties.observations=[]] Array of structured observations
 * @param {string} [params.tag_properties.color=null] Color code for the tag (e.g., hex code)
 * @param {Date} [params.tag_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.tag_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.tag_properties.archived_at=null] Date when the tag was archived
 * @param {string} params.user_id User ID who owns the tag entity
 * @param {string} [params.tag_content=''] Optional tag content/markdown
 * @param {string} [params.entity_id=null] Optional entity ID for updates
 * @param {string} [params.absolute_path=null] Absolute path to the file
 * @param {string} [params.base_relative_path=null] Base relative path to the file
 * @param {string} [params.git_sha=null] Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @param {string} [params.root_base_directory=null] Root base directory of the repository
 * @param {Object} [params.formatted_entity_metadata] Formatted entity metadata
 * @returns {Promise<string>} The entity_id of the tag
 */
export async function write_tag_to_database({
  tag_properties,
  user_id,
  tag_content = '',
  entity_id = null,
  absolute_path,
  base_relative_path,
  git_sha,
  trx = null,
  root_base_directory,
  formatted_entity_metadata
}) {
  try {
    log('Writing tag to database')
    const db_client = trx || db

    // First write the base entity
    const result_entity_id = await write_entity_to_database({
      entity_properties: tag_properties,
      entity_type: 'tag',
      user_id,
      entity_content: tag_content,
      entity_id,
      absolute_path,
      base_relative_path,
      git_sha,
      trx: db_client,
      root_base_directory,
      formatted_entity_metadata
    })

    // Process tag-specific data directly
    await write_tag_data_to_database({
      entity_id: result_entity_id,
      color: tag_properties.color,
      db_client
    })

    log(`Tag successfully written with ID: ${result_entity_id}`)
    return result_entity_id
  } catch (error) {
    log('Error writing tag to database:', error)
    throw error
  }
}

/**
 * Write tag-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {string} [params.color=null] Color code for the tag
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_tag_data_to_database({
  entity_id,
  color = null,
  db_client
}) {
  log(`Writing tag data for entity: ${entity_id}`)

  // Process tag-specific data
  const tag_data = {
    entity_id,
    color
  }

  // Upsert tag data
  await db_client('tags').insert(tag_data).onConflict('entity_id').merge()

  log(`Tag data written successfully for entity: ${entity_id}`)
}

export default write_tag_to_database
