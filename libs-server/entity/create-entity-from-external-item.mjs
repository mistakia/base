import debug from 'debug'
import { write_entity_to_filesystem } from './filesystem/index.mjs'
import { save_import_data } from '#libs-server/sync/index.mjs'

const log = debug('entity:external')

/**
 * Creates a new entity in the filesystem from an external item and records sync info in the database
 *
 * @param {Object} options - Function options
 * @param {Object} options.external_item - The external item data
 * @param {Object} options.entity_properties - The normalized external item data
 * @param {string} [options.entity_content] - The content for the markdown body (optional)
 * @param {string} options.entity_type - Type of entity to create (e.g., 'task', 'note')
 * @param {string} options.external_system - The external system identifier (e.g., 'github')
 * @param {string} options.external_id - External identifier for the item
 * @param {string} options.absolute_path - Absolute path where entity should be written
 * @param {string} options.user_public_key - The user public key creating the entity
 * @param {string} [options.import_cid] - Content identifier for import
 * @param {string} [options.import_history_base_directory] - Base directory for import history
 * @param {Object} [options.trx=null] - Optional database transaction
 * @returns {Promise<Object>} - The created entity data with entity_id
 */
export async function create_entity_from_external_item({
  external_item,
  entity_properties,
  entity_content = '',
  entity_type,
  external_system,
  external_id,
  absolute_path,
  user_public_key,
  import_cid,
  import_history_base_directory = null,
  trx = null
}) {
  try {
    log(`Creating ${entity_type} from ${external_system} item ${external_id}`)

    if (!external_item) {
      throw new Error('Missing external_item parameter')
    }

    if (!entity_properties) {
      throw new Error('Missing entity_properties parameter')
    }

    if (!entity_type) {
      throw new Error('Missing entity_type parameter')
    }

    if (!external_system) {
      throw new Error('Missing external_system parameter')
    }

    if (!external_id) {
      throw new Error('Missing external_id parameter')
    }

    if (!absolute_path) {
      throw new Error('Missing absolute_path parameter')
    }

    if (!user_public_key) {
      throw new Error('Missing user_public_key parameter')
    }

    // Create a copy of the entity properties to avoid mutations
    const entity_properties_copy = { ...entity_properties }

    // Add import tracking data if available
    if (import_cid) {
      entity_properties_copy.import_cid = import_cid
    }

    if (import_history_base_directory) {
      entity_properties_copy.import_history_path = import_history_base_directory
    }

    // Write entity to filesystem - this will also generate an entity_id
    const { entity_id, success } = await write_entity_to_filesystem({
      absolute_path,
      entity_properties: entity_properties_copy,
      entity_type,
      entity_content
    })

    if (!success) {
      throw new Error(
        `Failed to write ${entity_type} for ${external_system} item ${external_id} to filesystem`
      )
    }

    log(
      `Successfully created ${entity_type} with entity_id ${entity_id} for ${external_system} item ${external_id}`
    )

    // Save import data
    await save_import_data({
      external_system,
      entity_id,
      raw_data: external_item,
      processed_data: entity_properties,
      import_history_base_directory
    })

    return {
      entity_id,
      entity_properties: entity_properties_copy,
      absolute_path
    }
  } catch (error) {
    log(
      `Error creating ${entity_type} from ${external_system} item: ${error.message}`
    )
    throw error
  }
}
