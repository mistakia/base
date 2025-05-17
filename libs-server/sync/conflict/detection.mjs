import debug from 'debug'
import {
  get_sync_record,
  has_entity_changed_since_sync
} from '../sync-record/index.mjs'
import { detect_field_changes } from '../core/index.mjs'

const log = debug('sync:conflict:detection')

/**
 * Detects conflicts between local entity changes and external system changes
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - The entity ID
 * @param {Object} options.entity_properties - The entity properties
 * @param {string} options.external_system - The external system identifier
 * @param {Date} options.external_update_time - When the external system was last updated
 * @param {Object} [options.external_data=null] - External data for detailed comparison
 * @param {Object} [options.trx=null] - Optional transaction object
 * @returns {Promise<Object>} - Conflict detection result
 */
export async function detect_conflicts({
  entity_id,
  entity_properties,
  external_system,
  external_update_time,
  external_data = null,
  trx = null
}) {
  try {
    log(`Detecting conflicts for entity ${entity_id} with ${external_system}`)

    if (
      !entity_id ||
      !entity_properties ||
      !external_system ||
      !external_update_time
    ) {
      throw new Error('Missing required parameters for conflict detection')
    }

    // Get the sync record
    const sync_record = await get_sync_record({
      entity_id,
      external_system,
      trx
    })

    if (!sync_record) {
      // No sync record means this is new
      return { has_conflicts: false }
    }

    // Check for local changes since last sync
    const has_local_changes = await has_entity_changed_since_sync({
      entity_id,
      entity_updated_at: entity_properties.updated_at,
      external_system,
      trx
    })

    // Get the last external update time from sync record
    const last_external_update = sync_record.last_external_update_at
      ? new Date(sync_record.last_external_update_at)
      : new Date(0)

    // Check if external system has changes
    const external_update = new Date(external_update_time)
    const has_external_changes = external_update > last_external_update

    // Detect specific field changes if external data is provided
    const field_conflicts = {}

    if (external_data && has_external_changes && has_local_changes) {
      // Get previous sync data from sync record
      const previous_data = sync_record.sync_data.previous_data || {}

      // Detect changes in current data compared to previous sync
      const changes = detect_field_changes({
        current_data: external_data,
        previous_data
      })

      // Get field-specific conflict information
      for (const field in changes) {
        // Check if this field has last updated timestamp information
        const internal_updated_at =
          entity_properties.field_last_updated?.[field] ||
          entity_properties.updated_at

        field_conflicts[field] = {
          field_name: field,
          internal_value: entity_properties[field],
          external_value: external_data[field],
          internal_updated_at,
          external_updated_at: external_update_time,
          changed_in_current_import: true
        }
      }
    }

    // Detect overall conflict
    const has_conflicts = has_local_changes && has_external_changes

    return {
      has_conflicts,
      has_local_changes,
      has_external_changes,
      last_sync_time: sync_record.last_synced_at,
      local_update_time: new Date(entity_properties.updated_at),
      external_update_time: external_update,
      field_conflicts:
        Object.keys(field_conflicts).length > 0 ? field_conflicts : null
    }
  } catch (error) {
    log(`Error detecting conflicts: ${error.message}`)
    throw error
  }
}

/**
 * Determines update strategy based on conflicts
 *
 * @param {Object} options - Function options
 * @param {boolean} options.has_conflicts - Whether conflicts were detected
 * @param {boolean} options.has_local_changes - Whether local changes exist
 * @param {boolean} options.has_external_changes - Whether external changes exist
 * @param {boolean} [options.force_external=false] - Whether to force external updates
 * @returns {string} - The update strategy: 'external', 'local', 'conflict', or 'none'
 */
export function determine_update_strategy({
  has_conflicts,
  has_local_changes,
  has_external_changes,
  force_external = false
}) {
  if (!has_external_changes) {
    return 'none' // No external changes, nothing to update
  }

  if (!has_local_changes || force_external) {
    return 'external' // Apply external changes
  }

  if (has_conflicts) {
    return 'conflict' // Conflict detected
  }

  return 'local' // Keep local changes
}
