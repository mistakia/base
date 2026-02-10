import debug from 'debug'
import {
  read_entity_from_filesystem,
  write_entity_to_filesystem
} from '#libs-server/entity/filesystem/index.mjs'
import { detect_field_changes } from '#libs-server/sync/detect-field-changes.mjs'
import { save_import_data } from '#libs-server/sync/save-import-data.mjs'
import { find_previous_import_files } from '#libs-server/sync/find-previous-import-files.mjs'
import {
  remove_stale_external_properties,
  get_local_only_properties,
  get_protected_properties
} from '#libs-server/sync/clean-entity-properties.mjs'

const log = debug('sync:update-external')

/**
 * Validates required parameters
 */
function validate_required_params(params) {
  const required = [
    'external_item',
    'entity_properties',
    'entity_type',
    'external_system',
    'external_id',
    'absolute_path',
    'external_update_time'
  ]

  for (const param of required) {
    if (!params[param]) {
      throw new Error(`Missing required parameter: ${param}`)
    }
  }
}

/**
 * Validates external_id immutability
 */
function validate_external_id_immutability({
  existing_entity_properties,
  external_id,
  entity_id,
  absolute_path
}) {
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
}

/**
 * Extracts field values from change objects
 */
function extract_changes_from_detection(changes) {
  if (!changes || typeof changes !== 'object') {
    return {}
  }

  const updates = {}
  for (const [key, change] of Object.entries(changes)) {
    if (change && typeof change === 'object' && change.changed === true) {
      updates[key] = change.to
    }
  }
  return updates
}

/**
 * Handles GitHub-specific field preservation logic
 */
function apply_github_field_preservation({
  external_system,
  external_item,
  entity_properties,
  existing_entity_properties,
  updates_to_apply
}) {
  if (external_system !== 'github') {
    return
  }

  // Handle tags merging
  if (entity_properties.tags && Array.isArray(entity_properties.tags)) {
    const merged_tags = [...(existing_entity_properties.tags || [])]
    for (const tag of entity_properties.tags) {
      if (!merged_tags.includes(tag)) {
        merged_tags.push(tag)
      }
    }
    updates_to_apply.tags = merged_tags
  }

  // Preserve status if more specific than "No status"
  if (
    entity_properties.status &&
    existing_entity_properties.status &&
    entity_properties.status === 'No status' &&
    existing_entity_properties.status !== 'No status'
  ) {
    const issue_state = external_item?.state?.toLowerCase()
    if (external_item && issue_state === 'closed') {
      log(
        `Issue is closed, updating status from '${existing_entity_properties.status}' to Completed`
      )
    } else {
      log(
        `Preserving existing status '${existing_entity_properties.status}' instead of overwriting with 'No status' from issue import`
      )
      delete updates_to_apply.status
    }
  }

  // Preserve priority if more specific than "None"
  if (
    entity_properties.priority &&
    existing_entity_properties.priority &&
    entity_properties.priority === 'None' &&
    existing_entity_properties.priority !== 'None'
  ) {
    log(
      `Preserving existing priority '${existing_entity_properties.priority}' instead of overwriting with 'None' from issue import`
    )
    delete updates_to_apply.priority
  }

  // Preserve project-specific fields and GitHub URL
  const project_fields_to_preserve = [
    'github_graphql_id',
    'github_project_item_id',
    'github_project_number',
    'github_url',
    'finish_by',
    'start_by'
  ]

  for (const field of project_fields_to_preserve) {
    if (existing_entity_properties[field] && !(field in entity_properties)) {
      log(
        `Preserving existing ${field} '${existing_entity_properties[field]}' as it's not in new import data`
      )
      delete updates_to_apply[field]
    }
  }
}

/**
 * Builds updates to apply from detected changes
 */
function build_updates_to_apply({
  file_updates,
  internal_updates,
  entity_properties,
  force
}) {
  const updates_to_apply = {}

  // Extract changes from detection results
  const changes_to_apply = file_updates || internal_updates
  Object.assign(
    updates_to_apply,
    extract_changes_from_detection(changes_to_apply)
  )

  // When force is true, apply all fields from entity_properties
  if (force) {
    Object.assign(updates_to_apply, entity_properties)
  }

  return updates_to_apply
}

/**
 * Merges properties while preserving local-only and protected properties
 */
function merge_properties_with_preservation({
  existing_entity_properties,
  updates_to_apply
}) {
  const merged_properties = {
    ...existing_entity_properties,
    ...updates_to_apply
  }

  const local_only_properties = get_local_only_properties()
  const protected_properties = get_protected_properties()

  // Preserve local-only and protected properties from existing entity
  for (const prop of local_only_properties) {
    if (existing_entity_properties[prop] !== undefined) {
      merged_properties[prop] = existing_entity_properties[prop]
    }
  }

  for (const prop of protected_properties) {
    if (existing_entity_properties[prop] !== undefined) {
      merged_properties[prop] = existing_entity_properties[prop]
    }
  }

  return merged_properties
}

/**
 * Determines what needs to be synced back to external system
 */
function determine_sync_to_external({
  external_updates,
  internal_updates,
  previous_import
}) {
  if (!external_updates || !previous_import) {
    return null
  }

  const fields_to_sync = {}
  for (const [field, change] of Object.entries(external_updates)) {
    const external_field_changed = internal_updates && internal_updates[field]
    if (!external_field_changed) {
      fields_to_sync[field] = change
    }
  }

  return Object.keys(fields_to_sync).length > 0 ? fields_to_sync : null
}

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
 * @param {string} [options.import_source] - Import source identifier (e.g., 'issues', 'project') to separate import histories
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
  import_source = null,
  trx = null,
  force = false
}) {
  try {
    log(`Updating ${entity_type} from ${external_system} item ${external_id}`)

    validate_required_params({
      external_item,
      entity_properties,
      entity_type,
      external_system,
      external_id,
      absolute_path,
      external_update_time
    })

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

    validate_external_id_immutability({
      existing_entity_properties,
      external_id,
      entity_id,
      absolute_path
    })

    // Find previous import and detect changes
    const previous_import = await find_previous_import_files({
      external_system,
      entity_id,
      import_history_base_directory,
      import_source
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

    // Save import data if there are changes or no previous import
    if (internal_updates || !previous_import) {
      await save_import_data({
        external_system,
        entity_id,
        raw_data: external_item,
        processed_data: entity_properties,
        import_history_base_directory,
        import_source
      })
    }

    // Detect changes between normalized data and existing file
    const local_only_properties_list = Array.from(get_local_only_properties())
    const file_updates = detect_field_changes({
      current_data: entity_properties,
      previous_data: existing_entity_properties,
      ignore_fields: [
        'updated_at',
        'entity_id',
        'created_at',
        'base_uri',
        ...local_only_properties_list
      ]
    })

    // Build and apply updates if needed
    if (internal_updates || file_updates || force) {
      if (force) {
        log(`Force updating ${entity_type} from ${external_system}`)
      }

      const updates_to_apply = build_updates_to_apply({
        file_updates,
        internal_updates,
        entity_properties,
        force
      })

      // Apply GitHub-specific field preservation
      apply_github_field_preservation({
        external_system,
        external_item,
        entity_properties,
        existing_entity_properties,
        updates_to_apply
      })

      // Only proceed if there are actual changes
      const has_actual_changes = Object.keys(updates_to_apply).length > 0

      if (!has_actual_changes && !force) {
        log(
          `Skipping update for ${entity_type} ${external_id} - no actual changes after ignoring project-specific fields`
        )
      } else {
        // Merge properties while preserving local-only and protected properties
        const merged_properties = merge_properties_with_preservation({
          existing_entity_properties,
          updates_to_apply
        })

        // Check for final changes after preservation
        const final_changes = detect_field_changes({
          current_data: merged_properties,
          previous_data: existing_entity_properties,
          ignore_fields: ['updated_at']
        })

        // Check if body content has changed
        const body_content_changed =
          entity_content &&
          entity_content !== existing_entity_result.entity_content

        if (
          (final_changes && Object.keys(final_changes).length > 0) ||
          body_content_changed ||
          force
        ) {
          merged_properties.updated_at = new Date().toISOString()

          const change_reasons = []
          if (final_changes && Object.keys(final_changes).length > 0) {
            change_reasons.push(
              `${Object.keys(final_changes).length} field change(s): ${Object.keys(final_changes).join(', ')}`
            )
          }
          if (body_content_changed) {
            change_reasons.push('body content changed')
          }
          if (force && change_reasons.length === 0) {
            change_reasons.push('force update')
          }
          log(
            `Updating ${entity_type} ${external_id} - ${change_reasons.join(', ')}`
          )

          const cleaned_properties = remove_stale_external_properties(
            merged_properties,
            entity_properties,
            external_system
          )

          await write_entity_to_filesystem({
            entity_properties: cleaned_properties,
            entity_type,
            absolute_path,
            entity_content:
              entity_content || existing_entity_result.entity_content
          })
        } else {
          log(
            `Skipping file write for ${entity_type} ${external_id} - no actual changes after preserving local-only and protected properties`
          )
        }
      }
    }

    // Determine what needs to be synced back to external system
    const sync_to_external = determine_sync_to_external({
      external_updates,
      internal_updates,
      previous_import
    })

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
