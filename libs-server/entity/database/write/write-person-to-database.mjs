import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-person')

/**
 * Write a person entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.person_properties Person properties object
 * @param {string} params.person_properties.title Person name (required)
 * @param {string} params.person_properties.first_name First name (required)
 * @param {string} params.person_properties.last_name Last name (required)
 * @param {string} [params.person_properties.description=''] Person description
 * @param {string} [params.person_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.person_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.person_properties.tags=[]] Tags to associate with the person
 * @param {string[]} [params.person_properties.observations=[]] Array of structured observations
 * @param {string} [params.person_properties.email=null] Email address
 * @param {string} [params.person_properties.mobile_phone=null] Mobile phone number
 * @param {string} [params.person_properties.website_url=null] Personal website URL
 * @param {Date} [params.person_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.person_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.person_properties.archived_at=null] Date when the person was archived
 * @param {string} params.user_id User ID who owns the person entity
 * @param {string} [params.person_content=''] Optional person content/markdown
 * @param {string} [params.entity_id=null] Optional entity ID for updates
 * @param {string} params.absolute_path Absolute path to the file
 * @param {string} params.base_uri Base relative path to the file
 * @param {string} params.git_sha Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @param {Object} [params.formatted_entity_metadata=null] Formatted entity metadata
 * @returns {Promise<string>} The entity_id
 */
export async function write_person_to_database({
  person_properties,
  user_id,
  person_content = '',
  entity_id = null,
  absolute_path,
  base_uri,
  git_sha,
  trx = null,
  formatted_entity_metadata
}) {
  try {
    log('Writing person to database')
    const db_client = trx || db

    // Validate required person properties
    if (!person_properties.first_name) {
      throw new Error('First name is required for a person')
    }

    if (!person_properties.last_name) {
      throw new Error('Last name is required for a person')
    }

    // First write the base entity
    const result_entity_id = await write_entity_to_database({
      entity_properties: person_properties,
      entity_type: 'person',
      user_id,
      entity_content: person_content,
      entity_id,
      absolute_path,
      base_uri,
      git_sha,
      trx: db_client,
      formatted_entity_metadata
    })

    // Process person-specific data directly
    await write_person_data_to_database({
      entity_id: result_entity_id,
      first_name: person_properties.first_name,
      last_name: person_properties.last_name,
      email: person_properties.email,
      mobile_phone: person_properties.mobile_phone,
      website_url: person_properties.website_url,
      db_client
    })

    log(`Person successfully written with ID: ${result_entity_id}`)
    return result_entity_id
  } catch (error) {
    log('Error writing person to database:', error)
    throw error
  }
}

/**
 * Write person-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {string} params.first_name First name
 * @param {string} params.last_name Last name
 * @param {string} [params.email=null] Email address
 * @param {string} [params.mobile_phone=null] Mobile phone number
 * @param {string} [params.website_url=null] Personal website URL
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_person_data_to_database({
  entity_id,
  first_name,
  last_name,
  email = null,
  mobile_phone = null,
  website_url = null,
  db_client
}) {
  log(`Writing person data for entity: ${entity_id}`)

  // Process person-specific data
  const person_data = {
    entity_id,
    first_name,
    last_name,
    email,
    mobile_phone,
    website_url
  }

  // Upsert person data
  await db_client('persons').insert(person_data).onConflict('entity_id').merge()

  log(`Person data written successfully for entity: ${entity_id}`)
}

export default write_person_to_database
