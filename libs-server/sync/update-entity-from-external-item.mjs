import debug from 'debug'
import {
  read_entity_from_filesystem,
  write_entity_to_filesystem
} from '#libs-server/entity/filesystem/index.mjs'
import { detect_field_changes } from '#libs-server/sync/detect-field-changes.mjs'
import { save_import_data } from '#libs-server/sync/save-import-data.mjs'
import { find_previous_import_files } from '#libs-server/sync/find-previous-import-files.mjs'

const log = debug('sync:update-external')

/**
 * Updates an internal entity from external system changes with conflict resolution
 *
 * @param {Object} options - Function options
 * @param {Object} options.external_item - The external item data
 * @param {Object} options.entity_properties - The normalized entity properties
 * @param {string} options.entity_type - Type of entity to update
 * @param {string} options.external_system - The external system identifier
 * @param {string} options.external_id - External identifier for the item
 * @param {string} options.absolute_path - Path to the entity file
 * @param {Date} options.external_update_time - When the external item was last updated
 * @param {string} [options.import_cid] - Content identifier for import
 * @param {string} [options.import_history_base_directory] - Base directory for import history
 * @param {Object} [options.trx=null] - Optional database transaction
 * @returns {Promise<Object>} - The update result with conflict information
 */
export async function update_entity_from_external_item({
  external_item,
  entity_properties,
  entity_type,
  external_system,
  external_id,
  absolute_path,
  external_update_time,
  import_cid = null,
  import_history_base_directory = null,
  trx = null
}) {
  try {
    log(`Updating ${entity_type} from ${external_system} item ${external_id}`)

    if (!external_item) {
      throw new Error('Missing required parameter: external_item')
    }

    if (!entity_properties) {
      throw new Error('Missing required parameter: entity_properties')
    }

    if (!entity_type) {
      throw new Error('Missing required parameter: entity_type')
    }

    if (!external_system) {
      throw new Error('Missing required parameter: external_system')
    }

    if (!external_id) {
      throw new Error('Missing required parameter: external_id')
    }

    if (!absolute_path) {
      throw new Error('Missing required parameter: absolute_path')
    }

    if (!external_update_time) {
      throw new Error('Missing required parameter: external_update_time')
    }

    // Read the existing entity
    const entity_result = await read_entity_from_filesystem({
      absolute_path
    })

    if (!entity_result.success) {
      throw new Error(
        `Failed to read ${entity_type} file at ${absolute_path}: ${entity_result.error}`
      )
    }

    const existing_entity_properties = entity_result.entity_properties
    const entity_id = existing_entity_properties.entity_id

    const previous_import = await find_previous_import_files({
      external_system,
      entity_id,
      import_history_base_directory
    })

    const internal_updates = detect_field_changes({
      current_data: entity_properties,
      previous_data: previous_import.processed_data
    })

    const external_updates = detect_field_changes({
      current_data: existing_entity_properties,
      previous_data: entity_properties,
      compare_only_previous_fields: true,
      ignore_fields: ['updated_at']
    })

    if (internal_updates || !previous_import) {
      await save_import_data({
        external_system,
        entity_id,
        raw_data: external_item,
        processed_data: entity_properties,
        import_history_base_directory
      })
    }

    if (internal_updates) {
      const merged_properties = {
        ...existing_entity_properties,
        ...internal_updates
      }

      await write_entity_to_filesystem({
        entity_properties: merged_properties,
        entity_type,
        absolute_path
      })
    }

    return {
      action: external_updates || internal_updates ? 'updated' : 'skipped',
      entity_id,
      absolute_path,
      external_updates
    }
  } catch (error) {
    log(
      `Error updating ${entity_type} from ${external_system}: ${error.message}`
    )
    throw error
  }
}
