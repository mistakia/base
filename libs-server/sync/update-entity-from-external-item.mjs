import debug from 'debug'
import {
  read_entity_from_filesystem,
  write_entity_to_filesystem
} from '#libs-server/entity/filesystem/index.mjs'
import {
  detect_conflicts,
  determine_update_strategy,
  detect_field_changes,
  get_sync_record,
  update_sync_record,
  save_import_data,
  find_previous_import_files,
  resolve_entity_conflicts,
  apply_resolutions
} from './index.mjs'

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
 * @param {boolean} [options.force_update=false] - Whether to force update regardless of conflicts
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
  force_update = false,
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

    const existing_entity = entity_result.entity_properties
    const entity_id = existing_entity.entity_id

    // Find previous import to detect changes if import history is enabled
    let detected_changes = null
    const previous_import = await find_previous_import_files({
      external_system,
      entity_id,
      import_history_base_directory
    })

    if (previous_import && previous_import.processed_data) {
      detected_changes = detect_field_changes({
        current_data: entity_properties,
        previous_data: previous_import.processed_data
      })
    }

    // Save import data if changes detected or first import
    if (detected_changes || !previous_import) {
      await save_import_data({
        external_system,
        entity_id,
        raw_data: external_item,
        processed_data: entity_properties,
        import_history_base_directory
      })
    }

    // If no changes detected, skip update
    if (!detected_changes || Object.keys(detected_changes).length === 0) {
      log(
        `No changes detected for ${external_system} item ${external_id}, skipping update`
      )
      return {
        entity_id,
        absolute_path,
        entity_properties: existing_entity,
        updated: false,
        conflict: false,
        action: 'skipped'
      }
    }

    // Detect conflicts between local and external changes
    const conflict_result = await detect_conflicts({
      entity_id,
      entity_properties: existing_entity,
      external_system,
      external_update_time,
      external_data: entity_properties,
      trx
    })

    // Determine update strategy
    const update_strategy = determine_update_strategy({
      has_conflicts: conflict_result.has_conflicts,
      has_local_changes: conflict_result.has_local_changes,
      has_external_changes: conflict_result.has_external_changes,
      force_external: force_update
    })

    // Handle different update strategies
    if (update_strategy === 'none') {
      log(`No update needed for ${entity_type} ${entity_id}`)
      return {
        entity_id,
        absolute_path,
        entity_properties: existing_entity,
        updated: false,
        conflict: false,
        action: 'none'
      }
    }

    if (update_strategy === 'external') {
      // Apply external changes directly
      log(`Applying external changes to ${entity_type} ${entity_id}`)

      // Preserve local properties that should not be overwritten
      const merged_properties = {
        ...existing_entity,
        ...entity_properties,
        entity_id, // Ensure entity_id is preserved
        created_at: existing_entity.created_at, // Preserve creation timestamp
        updated_at: new Date().toISOString() // Update modification timestamp
      }

      // Write the updated entity to filesystem
      const update_result = await write_entity_to_filesystem({
        absolute_path,
        entity_properties: merged_properties,
        entity_type,
        entity_content: merged_properties.description || ''
      })

      if (!update_result.success) {
        throw new Error(
          `Failed to update ${entity_type} file: ${update_result.error}`
        )
      }

      // Update sync record
      await update_sync_record({
        entity_id,
        external_system,
        external_id,
        last_synced_at: new Date(),
        trx
      })

      return {
        entity_id,
        absolute_path,
        entity_properties: merged_properties,
        updated: true,
        conflict: false,
        action: 'external_updated'
      }
    }

    if (update_strategy === 'local') {
      // Keep local changes, just update the sync record
      log(`Keeping local changes for ${entity_type} ${entity_id}`)

      await update_sync_record({
        entity_id,
        external_system,
        external_id,
        last_synced_at: new Date(),
        trx
      })

      return {
        entity_id,
        absolute_path,
        entity_properties: existing_entity,
        updated: false,
        conflict: false,
        action: 'local_kept'
      }
    }

    if (update_strategy === 'conflict') {
      // Handle conflicts using resolution strategies
      log(`Resolving conflicts for ${entity_type} ${entity_id}`)

      // Get conflict resolution configuration
      const resolution_result = await resolve_entity_conflicts({
        entity_id,
        entity_properties: existing_entity,
        external_data: entity_properties,
        external_system,
        field_conflicts: conflict_result.field_conflicts,
        trx
      })

      // Apply resolutions
      const resolved_properties = await apply_resolutions({
        entity_properties: existing_entity,
        external_data: entity_properties,
        resolutions: resolution_result.resolutions
      })

      // Write the resolved entity to filesystem
      const update_result = await write_entity_to_filesystem({
        absolute_path,
        entity_properties: resolved_properties,
        entity_type,
        entity_content: resolved_properties.description || ''
      })

      if (!update_result.success) {
        throw new Error(
          `Failed to update ${entity_type} file: ${update_result.error}`
        )
      }

      // Update sync record
      await update_sync_record({
        entity_id,
        external_system,
        external_id,
        last_synced_at: new Date(),
        trx
      })

      return {
        entity_id,
        absolute_path,
        entity_properties: resolved_properties,
        updated: true,
        conflict: true,
        action: 'conflicts_resolved',
        conflicts: resolution_result
      }
    }

    // Fallback - should not reach here
    throw new Error(`Unknown update strategy: ${update_strategy}`)
  } catch (error) {
    log(
      `Error updating ${entity_type} from ${external_system}: ${error.message}`
    )
    throw error
  }
}
