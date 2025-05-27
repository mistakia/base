import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-organization')

/**
 * Write an organization entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.organization_properties Organization properties object
 * @param {string} params.organization_properties.title Organization name (required)
 * @param {string} [params.organization_properties.description=''] Organization description
 * @param {string} [params.organization_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.organization_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.organization_properties.tags=[]] Tags to associate with the organization
 * @param {string[]} [params.organization_properties.observations=[]] Array of structured observations
 * @param {string} [params.organization_properties.website_url=null] Organization website URL
 * @param {Date} [params.organization_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.organization_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.organization_properties.archived_at=null] Date when the organization was archived
 * @param {string} params.user_id User ID who owns the organization entity
 * @param {string} [params.organization_content=''] Optional organization content/markdown
 * @param {string} [params.organization_id=null] Optional organization ID for updates
 * @param {string} params.absolute_path Absolute path to the file
 * @param {string} params.base_relative_path Base relative path to the file
 * @param {string} params.git_sha Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<string>} The organization_id (same as entity_id)
 */
export async function write_organization_to_database({
  organization_properties,
  user_id,
  organization_content = '',
  organization_id = null,
  absolute_path,
  base_relative_path,
  git_sha,
  trx = null
}) {
  try {
    log('Writing organization to database')
    const db_client = trx || db

    // First write the base entity
    const entity_id = await write_entity_to_database({
      entity_properties: organization_properties,
      entity_type: 'organization',
      user_id,
      entity_content: organization_content,
      entity_id: organization_id,
      absolute_path,
      base_relative_path,
      git_sha,
      trx: db_client
    })

    // Process organization-specific data directly
    await write_organization_data_to_database({
      entity_id,
      website_url: organization_properties.website_url,
      db_client
    })

    log(`Organization successfully written with ID: ${entity_id}`)
    return entity_id
  } catch (error) {
    log('Error writing organization to database:', error)
    throw error
  }
}

/**
 * Write organization-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {string} [params.website_url=null] Organization website URL
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_organization_data_to_database({
  entity_id,
  website_url = null,
  db_client
}) {
  log(`Writing organization data for entity: ${entity_id}`)

  // Process organization-specific data
  const organization_data = {
    entity_id,
    website_url
  }

  // Upsert organization data
  await db_client('organizations')
    .insert(organization_data)
    .onConflict('entity_id')
    .merge()

  log(`Organization data written successfully for entity: ${entity_id}`)
}

export default write_organization_to_database
