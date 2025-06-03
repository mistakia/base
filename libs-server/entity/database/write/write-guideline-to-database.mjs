import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-guideline')

/**
 * Write a guideline entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.guideline_properties Guideline properties
 * @param {string} params.guideline_properties.title Title of the guideline (required)
 * @param {string} [params.guideline_properties.description=''] Description of the guideline
 * @param {string} [params.guideline_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.guideline_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.guideline_properties.tags=[]] Tags to associate with the guideline
 * @param {string[]} [params.guideline_properties.observations=[]] Array of structured observations
 * @param {Date} [params.guideline_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.guideline_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.guideline_properties.archived_at=null] Date when the guideline was archived
 * @param {string} [params.guideline_properties.guideline_status='Draft'] Status of the guideline (Draft, Approved, Deprecated)
 * @param {Date} [params.guideline_properties.effective_date=null] Date when the guideline becomes effective
 * @param {string[]} [params.guideline_properties.globs=[]] Glob patterns for files that this guideline applies to
 * @param {boolean} [params.guideline_properties.always_apply=false] Whether this guideline should always be applied
 * @param {string} params.user_id User ID who owns the guideline
 * @param {string} [params.guideline_content=''] Optional guideline content/markdown
 * @param {string} [params.entity_id=null] Optional entity ID for updates
 * @param {string} params.absolute_path Absolute path to the file
 * @param {string} params.base_relative_path Base relative path to the file
 * @param {string} params.git_sha Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @param {string} [params.root_base_directory=null] Root base directory of the repository
 * @param {Object} [params.formatted_entity_metadata] Formatted entity metadata
 * @returns {Promise<string>} The entity_id of the guideline
 */
export async function write_guideline_to_database({
  guideline_properties,
  user_id,
  guideline_content = '',
  entity_id = null,
  absolute_path,
  base_relative_path,
  git_sha,
  trx = null,
  root_base_directory,
  formatted_entity_metadata
}) {
  try {
    log('Writing guideline to database')
    const db_client = trx || db

    // First write the base entity
    const returned_entity_id = await write_entity_to_database({
      entity_properties: guideline_properties,
      entity_type: 'guideline',
      user_id,
      entity_content: guideline_content,
      entity_id,
      absolute_path,
      base_relative_path,
      git_sha,
      trx: db_client,
      root_base_directory,
      formatted_entity_metadata
    })

    // Process guideline-specific data directly
    await write_guideline_data_to_database({
      entity_id: returned_entity_id,
      guideline_status: guideline_properties.guideline_status,
      effective_date: guideline_properties.effective_date,
      globs: guideline_properties.globs,
      always_apply: guideline_properties.always_apply,
      db_client
    })

    log(`Guideline successfully written with ID: ${returned_entity_id}`)
    return returned_entity_id
  } catch (error) {
    log('Error writing guideline to database:', error)
    throw error
  }
}

/**
 * Write guideline-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {string} [params.guideline_status='Draft'] Status of the guideline (Draft, Approved, Deprecated)
 * @param {Date} [params.effective_date=null] Date when the guideline becomes effective
 * @param {string[]} [params.globs=[]] Glob patterns for files that this guideline applies to
 * @param {boolean} [params.always_apply=false] Whether this guideline should always be applied
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_guideline_data_to_database({
  entity_id,
  guideline_status = 'Draft',
  effective_date = null,
  globs = [],
  always_apply = false,
  db_client
}) {
  log(`Writing guideline data for entity: ${entity_id}`)

  // Process guideline-specific data
  const guideline_data = {
    entity_id,
    guideline_status,
    effective_date,
    globs: JSON.stringify(globs || []),
    always_apply: always_apply || false
  }

  // Store guideline data in the guideline table
  await db_client('guidelines')
    .insert(guideline_data)
    .onConflict('entity_id')
    .merge()

  log(`Guideline data written successfully for entity: ${entity_id}`)
}

export default write_guideline_to_database
