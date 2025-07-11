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
 * @param {string} [options.entity_content] - The content for the markdown body (optional)
 * @param {string} options.entity_type - Type of entity to update
 * @param {string} options.external_system - The external system identifier
 * @param {string} options.external_id - External identifier for the item
 * @param {string} options.absolute_path - Path to the entity file
 * @param {Date} options.external_update_time - When the external item was last updated
 * @param {string} [options.import_cid] - Content identifier for import
 * @param {string} [options.import_history_base_directory] - Base directory for import history
 * @param {Object} [options.trx=null] - Optional database transaction
 * @param {boolean} [options.force=false] - Force update all tasks regardless of content
 * @returns {Promise<Object>} - The update result with conflict information
 */
export async function update_entity_from_external_item({
  external_item,
  entity_properties,
  entity_content = null,
  entity_type,
  external_system,
  external_id,
  absolute_path,
  external_update_time,
  import_cid = null,
  import_history_base_directory = null,
  trx = null,
  force = false
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
    const existing_entity_result = await read_entity_from_filesystem({
      absolute_path
    })

    if (!existing_entity_result.success) {
      throw new Error(
        `Failed to read ${entity_type} file at ${absolute_path}: ${existing_entity_result.error}`
      )
    }

    const existing_entity_properties = existing_entity_result.entity_properties
    const entity_id = existing_entity_properties.entity_id

    // CRITICAL: Validate external_id immutability
    // The external_id is the source of truth and must never be changed
    if (
      existing_entity_properties.external_id &&
      existing_entity_properties.external_id !== external_id
    ) {
      const error_message = [
        'External ID immutability violation detected.',
        `Entity ${entity_id} at ${absolute_path}`,
        `has external_id "${existing_entity_properties.external_id}"`,
        `but sync attempted to update it with "${external_id}".`,
        'This indicates incorrect entity matching - entities should only be',
        'updated by their original external source.'
      ].join(' ')

      log(error_message)
      throw new Error(error_message)
    }

    const previous_import = await find_previous_import_files({
      external_system,
      entity_id,
      import_history_base_directory
    })

    const internal_updates = detect_field_changes({
      current_data: entity_properties,
      previous_data: previous_import?.processed_data
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

    if (internal_updates || force) {
      // Extract values from change objects
      const updates_to_apply = {}

      // Ensure internal_updates is an object before using Object.entries
      if (internal_updates && typeof internal_updates === 'object') {
        for (const [key, change] of Object.entries(internal_updates)) {
          if (change && typeof change === 'object' && change.changed === true) {
            updates_to_apply[key] = change.to
          }
        }
      }

      // When force is true, apply all fields from entity_properties
      if (force) {
        log(`Force updating ${entity_type} from ${external_system}`)
        // Only overwrite fields that exist in the external properties
        for (const [key, value] of Object.entries(entity_properties)) {
          updates_to_apply[key] = value
        }
      }

      // Handle tags from GitHub labels if present
      if (entity_properties.tags && Array.isArray(entity_properties.tags)) {
        // Merge with existing tags if they exist
        const merged_tags = [...(existing_entity_properties.tags || [])]

        // Add new tags that don't already exist
        for (const tag of entity_properties.tags) {
          if (!merged_tags.includes(tag)) {
            merged_tags.push(tag)
          }
        }

        // Update the tags field
        updates_to_apply.tags = merged_tags
      }

      const merged_properties = {
        ...existing_entity_properties,
        ...updates_to_apply
      }

      await write_entity_to_filesystem({
        entity_properties: merged_properties,
        entity_type,
        absolute_path,
        entity_content: entity_content || existing_entity_result.entity_content
      })
    }

    // Determine what needs to be synced back to external system
    let sync_to_external = null

    if (external_updates && previous_import) {
      // Only sync fields where local has changed but external hasn't changed since last import
      const fields_to_sync = {}

      for (const [field, change] of Object.entries(external_updates)) {
        // Check if this field has changed in the external system since last import
        const external_field_changed =
          internal_updates && internal_updates[field]

        if (!external_field_changed) {
          // External field hasn't changed, so we can safely sync local changes
          fields_to_sync[field] = change
        }
      }

      if (Object.keys(fields_to_sync).length > 0) {
        sync_to_external = fields_to_sync
      }
    }

    return {
      action:
        external_updates || internal_updates || force ? 'updated' : 'skipped',
      entity_id,
      absolute_path,
      external_updates,
      sync_to_external,
      internal_updates
    }
  } catch (error) {
    log(
      `Error updating ${entity_type} from ${external_system}: ${error.message}`
    )
    throw error
  }
}
