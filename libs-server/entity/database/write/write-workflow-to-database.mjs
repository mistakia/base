import debug from 'debug'
import db from '#db'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-workflow')

/**
 * Write a workflow entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.workflow_properties Workflow properties
 * @param {string} params.workflow_properties.title Title of the workflow (required)
 * @param {string} [params.workflow_properties.description=''] Description of the workflow
 * @param {string} [params.workflow_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.workflow_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.workflow_properties.tags=[]] Tags to associate with the workflow
 * @param {string[]} [params.workflow_properties.observations=[]] Array of structured observations
 * @param {Date} [params.workflow_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.workflow_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.workflow_properties.archived_at=null] Date when the workflow was archived
 * @param {string} params.user_id User ID who owns the workflow
 * @param {string} [params.workflow_content=''] Optional workflow content/markdown
 * @param {string} [params.entity_id=null] Optional entity ID for updates
 * @param {string} [params.absolute_path=null] Absolute path to the file
 * @param {string} [params.base_uri=null] Base relative path to the file
 * @param {string} [params.git_sha=null] Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @param {Object} [params.formatted_entity_metadata] Formatted entity metadata
 * @returns {Promise<string>} The entity_id of the workflow
 */
export async function write_workflow_to_database({
  workflow_properties,
  user_id,
  workflow_content = '',
  entity_id = null,
  absolute_path,
  base_uri,
  git_sha,
  trx = null,
  formatted_entity_metadata
}) {
  try {
    log('Writing workflow to database')
    const db_client = trx || db

    // First write the base entity
    const result_entity_id = await write_entity_to_database({
      entity_properties: workflow_properties,
      entity_type: 'workflow',
      user_id,
      entity_content: workflow_content,
      entity_id,
      absolute_path,
      base_uri,
      git_sha,
      trx: db_client,
      formatted_entity_metadata
    })

    // Process workflow-specific data directly
    await write_workflow_data_to_database({
      entity_id: result_entity_id,
      db_client
    })

    log(`Workflow successfully written with ID: ${result_entity_id}`)
    return result_entity_id
  } catch (error) {
    log('Error writing workflow to database:', error)
    throw error
  }
}

/**
 * Write workflow-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_workflow_data_to_database({ entity_id, db_client }) {
  log(`Writing workflow data for entity: ${entity_id}`)

  // Per schema.sql, workflows table only has entity_id field
  const workflow_data = {
    entity_id
  }

  // Upsert workflow data
  await db_client('workflows')
    .insert(workflow_data)
    .onConflict('entity_id')
    .merge()

  log(`Workflow data written successfully for entity: ${entity_id}`)
}

export default write_workflow_to_database
