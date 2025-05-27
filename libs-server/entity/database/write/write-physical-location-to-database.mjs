import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-physical-location')

/**
 * Write a physical location entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.physical_location_properties Physical location properties object
 * @param {string} params.physical_location_properties.title Location name (required)
 * @param {string} [params.physical_location_properties.description=''] Location description
 * @param {string} [params.physical_location_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.physical_location_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.physical_location_properties.tags=[]] Tags to associate with the location
 * @param {string[]} [params.physical_location_properties.observations=[]] Array of structured observations
 * @param {number} [params.physical_location_properties.latitude=null] Decimal latitude coordinate
 * @param {number} [params.physical_location_properties.longitude=null] Decimal longitude coordinate
 * @param {string} [params.physical_location_properties.mail_address=null] Complete street address
 * @param {string} [params.physical_location_properties.mail_address2=null] Additional address information
 * @param {string} [params.physical_location_properties.mail_careof=null] Care of recipient
 * @param {string} [params.physical_location_properties.mail_street_number=null] Street number
 * @param {string} [params.physical_location_properties.mail_street_prefix=null] Street prefix
 * @param {string} [params.physical_location_properties.mail_street_name=null] Street name
 * @param {string} [params.physical_location_properties.mail_street_type=null] Street type
 * @param {string} [params.physical_location_properties.mail_street_suffix=null] Street suffix
 * @param {string} [params.physical_location_properties.mail_unit_number=null] Unit number
 * @param {string} [params.physical_location_properties.mail_city=null] City
 * @param {string} [params.physical_location_properties.mail_state=null] State/Province
 * @param {string} [params.physical_location_properties.mail_zip=null] ZIP/Postal code
 * @param {string} [params.physical_location_properties.mail_country=null] Country
 * @param {string} [params.physical_location_properties.mail_urbanization=null] Urbanization code
 * @param {Date} [params.physical_location_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.physical_location_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.physical_location_properties.archived_at=null] Date when the location was archived
 * @param {string} params.user_id User ID who owns the location entity
 * @param {string} [params.physical_location_content=''] Optional location content/markdown
 * @param {string} [params.physical_location_id=null] Optional location ID for updates
 * @param {string} params.absolute_path Absolute path to the file
 * @param {string} params.base_relative_path Base relative path to the file
 * @param {string} params.git_sha Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<string>} The physical_location_id (same as entity_id)
 */
export async function write_physical_location_to_database({
  physical_location_properties,
  user_id,
  physical_location_content = '',
  physical_location_id = null,
  absolute_path,
  base_relative_path,
  git_sha,
  trx = null
}) {
  try {
    log('Writing physical location to database')
    const db_client = trx || db

    // First write the base entity
    const entity_id = await write_entity_to_database({
      entity_properties: physical_location_properties,
      entity_type: 'physical_location',
      user_id,
      entity_content: physical_location_content,
      entity_id: physical_location_id,
      absolute_path,
      base_relative_path,
      git_sha,
      trx: db_client
    })

    // Process physical location-specific data
    await write_physical_location_data_to_database({
      entity_id,
      latitude: physical_location_properties.latitude,
      longitude: physical_location_properties.longitude,
      mail_address: physical_location_properties.mail_address,
      mail_address2: physical_location_properties.mail_address2,
      mail_careof: physical_location_properties.mail_careof,
      mail_street_number: physical_location_properties.mail_street_number,
      mail_street_prefix: physical_location_properties.mail_street_prefix,
      mail_street_name: physical_location_properties.mail_street_name,
      mail_street_type: physical_location_properties.mail_street_type,
      mail_street_suffix: physical_location_properties.mail_street_suffix,
      mail_unit_number: physical_location_properties.mail_unit_number,
      mail_city: physical_location_properties.mail_city,
      mail_state: physical_location_properties.mail_state,
      mail_zip: physical_location_properties.mail_zip,
      mail_country: physical_location_properties.mail_country,
      mail_urbanization: physical_location_properties.mail_urbanization,
      db_client
    })

    log(`Physical location successfully written with ID: ${entity_id}`)
    return entity_id
  } catch (error) {
    log('Error writing physical location to database:', error)
    throw error
  }
}

/**
 * Write physical location-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {number} [params.latitude=null] Decimal latitude coordinate
 * @param {number} [params.longitude=null] Decimal longitude coordinate
 * @param {string} [params.mail_address=null] Complete street address
 * @param {string} [params.mail_address2=null] Additional address information
 * @param {string} [params.mail_careof=null] Care of recipient
 * @param {string} [params.mail_street_number=null] Street number
 * @param {string} [params.mail_street_prefix=null] Street prefix
 * @param {string} [params.mail_street_name=null] Street name
 * @param {string} [params.mail_street_type=null] Street type
 * @param {string} [params.mail_street_suffix=null] Street suffix
 * @param {string} [params.mail_unit_number=null] Unit number
 * @param {string} [params.mail_city=null] City
 * @param {string} [params.mail_state=null] State/Province
 * @param {string} [params.mail_zip=null] ZIP/Postal code
 * @param {string} [params.mail_country=null] Country
 * @param {string} [params.mail_urbanization=null] Urbanization code
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_physical_location_data_to_database({
  entity_id,
  latitude = null,
  longitude = null,
  mail_address = null,
  mail_address2 = null,
  mail_careof = null,
  mail_street_number = null,
  mail_street_prefix = null,
  mail_street_name = null,
  mail_street_type = null,
  mail_street_suffix = null,
  mail_unit_number = null,
  mail_city = null,
  mail_state = null,
  mail_zip = null,
  mail_country = null,
  mail_urbanization = null,
  db_client
}) {
  log(`Writing physical location data for entity: ${entity_id}`)

  // Process physical location-specific data
  const physical_location_data = {
    entity_id,
    latitude,
    longitude,
    mail_address,
    mail_address2,
    mail_careof,
    mail_street_number,
    mail_street_prefix,
    mail_street_name,
    mail_street_type,
    mail_street_suffix,
    mail_unit_number,
    mail_city,
    mail_state,
    mail_zip,
    mail_country,
    mail_urbanization
  }

  // Upsert physical location data
  await db_client('physical_locations')
    .insert(physical_location_data)
    .onConflict('entity_id')
    .merge()

  log(`Physical location data written successfully for entity: ${entity_id}`)
}

export default write_physical_location_to_database
