import debug from 'debug'
import db from '#db'
import {
  get_entity_sync_config,
  get_entity_data_with_extensions,
  update_field_last_updated_timestamps
} from './sync-core.mjs'

const log = debug('sync:conflict-resolver')

/**
 * Available resolution strategies
 */
export const resolution_strategies = {
  internal_wins: resolve_internal_wins,
  external_wins: resolve_external_wins,
  newest_wins: resolve_newest_wins,
  manual: queue_for_manual_resolution
}

/**
 * Resolve conflict by keeping internal value
 *
 * @param {Object} conflict - Conflict information
 * @param {string} conflict.internal_value - Internal value
 * @returns {Object} Resolution result
 */
export function resolve_internal_wins({ internal_value }) {
  return {
    value: internal_value,
    target: 'external',
    reason: 'internal_strategy'
  }
}

/**
 * Resolve conflict by using external value
 *
 * @param {Object} conflict - Conflict information
 * @param {string} conflict.external_value - External value
 * @returns {Object} Resolution result
 */
export function resolve_external_wins({ external_value }) {
  return {
    value: external_value,
    target: 'internal',
    reason: 'external_strategy'
  }
}

/**
 * Resolve based on which value was updated most recently
 * Only applies if the field actually changed in the external system
 *
 * @param {Object} conflict - Conflict information
 * @param {boolean} conflict.changed_in_current_import - Whether the field changed in the current import
 * @param {string} conflict.internal_updated_at - Internal updated timestamp
 * @param {string} conflict.external_updated_at - External updated timestamp
 * @param {string} conflict.internal_value - Internal value
 * @param {string} conflict.external_value - External value
 * @returns {Object} Resolution result
 */
export function resolve_newest_wins({
  changed_in_current_import,
  internal_updated_at,
  external_updated_at,
  internal_value,
  external_value
}) {
  // Only apply if the field actually changed in the external system
  if (!changed_in_current_import) {
    return resolve_internal_wins({ internal_value })
  }

  const internal_updated_at_date = new Date(internal_updated_at)
  const external_updated_at_date = new Date(external_updated_at)

  if (external_updated_at_date > internal_updated_at_date) {
    return {
      value: external_value,
      target: 'internal',
      reason: 'external_newer'
    }
  } else {
    return {
      value: internal_value,
      target: 'external',
      reason: 'internal_newer'
    }
  }
}

/**
 * Queue conflict for manual resolution
 *
 * @param {Object} conflict - Conflict information
 * @param {string} conflict.sync_id - Sync ID
 * @param {string} conflict.import_cid - Import CID
 * @param {string} conflict.internal_value - Internal value
 * @param {string} conflict.external_value - External value
 * @param {string} conflict.internal_updated_at - Internal updated timestamp
 * @param {string} conflict.external_updated_at - External updated timestamp
 * @param {string} conflict.field_name - Field name
 * @returns {Object} Resolution result
 */
export async function queue_for_manual_resolution({
  sync_id,
  import_cid,
  internal_value,
  external_value,
  internal_updated_at,
  external_updated_at,
  field_name
}) {
  // Find existing conflict record or create new one
  let conflict_record = await db('sync_conflicts')
    .where({
      sync_id,
      import_cid,
      status: 'pending'
    })
    .first()

  // Create new conflict record if none exists
  if (!conflict_record) {
    // Create conflict record
    const [new_conflict_record] = await db('sync_conflicts')
      .insert({
        sync_id,
        import_cid,
        conflicts: {},
        status: 'pending'
      })
      .returning('*')

    conflict_record = new_conflict_record
  }

  // Update conflicts with this field
  const updated_conflicts = {
    ...(conflict_record.conflicts || {}),
    [field_name]: {
      internal_value,
      external_value,
      internal_updated_at,
      external_updated_at,
      field_name
    }
  }

  // Update conflict record
  await db('sync_conflicts')
    .where({ conflict_id: conflict_record.conflict_id })
    .update({
      conflicts: updated_conflicts
    })

  return {
    value: internal_value, // Keep internal value for now
    target: 'none',
    reason: 'pending_manual_resolution'
  }
}

/**
 * Detect conflicts between entity and external data
 *
 * @param {Object} options - Function options
 * @param {Object} options.entity - Entity object
 * @param {Object} options.external_data - External data object
 * @param {Object} options.sync_record - Sync record
 * @param {Object} options.changes - Detected changes object
 * @param {string} options.import_cid - Content ID of import
 * @returns {Object} Conflicts object
 */
export async function detect_conflicts({
  entity,
  external_data,
  sync_record,
  changes,
  import_cid
}) {
  // Get full entity data
  const entity_data = await get_entity_data_with_extensions(entity)

  // Only process fields that changed in this import
  const changed_fields = changes ? Object.keys(changes) : []
  if (changed_fields.length === 0) return {}

  const detected_conflicts = {}

  // Get field last updated timestamps
  const field_last_updated = sync_record.field_last_updated || {}

  // For each changed field
  for (const field_name of changed_fields) {
    const internal_value = entity_data[field_name]
    const external_value = external_data[field_name]

    // Only create conflict if values differ
    if (String(internal_value) !== String(external_value)) {
      detected_conflicts[field_name] = {
        field_name,
        internal_value,
        external_value,
        internal_updated_at:
          field_last_updated[field_name] || entity.updated_at,
        external_updated_at:
          external_data.updated_at || new Date().toISOString(),
        changed_in_current_import: true,
        sync_id: sync_record.sync_id,
        import_cid
      }
    }
  }

  return detected_conflicts
}

/**
 * Resolve conflicts for an entity
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity UUID
 * @param {Object} options.conflicts - Conflicts object
 * @param {string} options.external_system - Name of external system
 * @returns {Object} Resolutions object
 */
export async function resolve_entity_conflicts({
  entity_id,
  conflicts,
  external_system
}) {
  // Get sync record
  const sync_record = await db('external_syncs')
    .where({ entity_id, external_system })
    .first()

  if (!sync_record) {
    throw new Error(
      `No sync record found for entity ${entity_id} and system ${external_system}`
    )
  }

  // Get sync config
  const sync_config = await get_entity_sync_config({
    entity_id,
    external_system
  })

  const resolutions = {}
  let has_manual_conflicts = false

  // Process each conflict
  for (const [field_name, conflict] of Object.entries(conflicts)) {
    // Get strategy for this field
    const strategy_name = sync_config.field_strategies[field_name] || 'manual'
    const resolution_strategy = resolution_strategies[strategy_name]

    if (!resolution_strategy) {
      log(`Unknown conflict strategy: ${strategy_name}, using manual fallback`)
      const resolution = await resolution_strategies.manual(conflict)
      resolutions[field_name] = resolution
      has_manual_conflicts = true
      continue
    }

    // Apply strategy
    const resolution = await resolution_strategy(conflict)
    resolutions[field_name] = resolution

    // If manual resolution required, flag for saving as pending conflict
    if (strategy_name === 'manual' || resolution.target === 'none') {
      has_manual_conflicts = true
    }
  }

  return {
    resolutions,
    has_manual_conflicts
  }
}

/**
 * Apply resolutions to entity and external system
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity UUID
 * @param {Object} options.resolutions - Resolutions object
 * @param {function} options.update_external_entity - Function to update external entity
 * @param {string} options.external_id - External ID
 * @returns {Object} Updated fields object
 */
export async function apply_resolutions({
  entity_id,
  resolutions,
  update_external_entity,
  external_id
}) {
  // Group updates by target
  const internal_updates = {}
  const external_updates = {}

  for (const [field_name, resolution] of Object.entries(resolutions)) {
    if (resolution.target === 'internal') {
      internal_updates[field_name] = resolution.value
    } else if (resolution.target === 'external') {
      external_updates[field_name] = resolution.value
    } else if (resolution.target === 'both') {
      // Apply to both internal and external
      internal_updates[field_name] = resolution.value
      external_updates[field_name] = resolution.value
    }
  }

  // Apply internal updates
  if (Object.keys(internal_updates).length > 0) {
    await apply_internal_updates({
      entity_id,
      updates: internal_updates,
      external_id
    })
  }

  // Apply external updates
  if (Object.keys(external_updates).length > 0 && update_external_entity) {
    await update_external_entity(external_id, external_updates)
  }

  return {
    internal_updates,
    external_updates
  }
}

/**
 * Apply internal updates to the appropriate tables
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity UUID
 * @param {Object} options.updates - Updates to apply
 * @param {string} options.external_id - External ID
 * @returns {Promise<void>}
 */
async function apply_internal_updates({ entity_id, updates, external_id }) {
  // Get entity type
  const entity = await db('entities')
    .select('type')
    .where({ entity_id })
    .first()

  if (!entity) {
    throw new Error(`Entity ${entity_id} not found`)
  }

  // Extract entity table fields
  const entity_fields = ['title', 'description', 'updated_at']
  const entity_updates = {}
  const extension_updates = { ...updates }

  for (const field of entity_fields) {
    if (field in updates) {
      entity_updates[field] = updates[field]
      delete extension_updates[field]
    }
  }

  // Always update the updated_at timestamp
  entity_updates.updated_at = new Date()

  // Apply entity updates if any
  if (Object.keys(entity_updates).length > 0) {
    await db('entities').where({ entity_id }).update(entity_updates)
  }

  // Process extension table specific fields and apply updates
  if (Object.keys(extension_updates).length > 0) {
    // Convert date fields based on entity type
    const processed_updates = process_extension_table_updates(
      entity.type,
      extension_updates
    )

    // Apply extension table updates
    if (Object.keys(processed_updates).length > 0) {
      await db(`${entity.type}s`).where({ entity_id }).update(processed_updates)
    }
  }

  // Update field timestamps
  const sync_record = await db('external_syncs')
    .where({ entity_id, external_id })
    .first()

  if (sync_record) {
    await update_field_last_updated_timestamps(sync_record.sync_id, updates)
  }
}

/**
 * Process extension table updates based on entity type
 *
 * @param {string} entity_type - Entity type (e.g., 'task', 'physical_item')
 * @param {Object} updates - Updates to apply
 * @returns {Object} Processed updates
 */
function process_extension_table_updates(entity_type, updates) {
  const processed_updates = { ...updates }

  // Define date fields for each entity type
  const date_fields = {
    task: [
      'start_by',
      'finish_by',
      'planned_start',
      'planned_finish',
      'started_at',
      'finished_at',
      'snooze_until'
    ],
    physical_item: ['acquisition_date'],
    guideline: ['effective_date']
    // Add other entity types with date fields as needed
  }

  // Convert date strings to Date objects for appropriate fields
  const type_date_fields = date_fields[entity_type] || []

  for (const field of type_date_fields) {
    if (field in processed_updates && processed_updates[field]) {
      processed_updates[field] = new Date(processed_updates[field])
    }
  }

  // Handle any other entity-specific field conversions here
  // For example, array fields, JSON fields, etc.

  return processed_updates
}

/**
 * Manually resolve conflicts
 *
 * @param {string} conflict_id - Conflict record UUID
 * @param {Object} resolutions - User-provided resolutions
 * @param {string} user_id - User UUID
 * @returns {Object} Result of resolution
 */
export async function manual_resolve_conflicts(
  conflict_id,
  resolutions,
  user_id
) {
  // Get conflict record
  const conflict_record = await db('sync_conflicts')
    .where({ conflict_id })
    .first()

  if (!conflict_record) {
    throw new Error(`Conflict record ${conflict_id} not found`)
  }

  // Get sync record
  const sync_record = await db('external_syncs')
    .where({ sync_id: conflict_record.sync_id })
    .first()

  if (!sync_record) {
    throw new Error(`Sync record ${conflict_record.sync_id} not found`)
  }

  // Process each resolution
  const all_resolutions = {}
  const applied_fields = {}

  for (const [field_name, resolution] of Object.entries(resolutions)) {
    // Get conflict data
    const conflict_data = conflict_record.conflicts[field_name]
    if (!conflict_data) {
      continue
    }

    // Create resolution object
    let resolved_value
    let target

    if (resolution.choice === 'internal') {
      resolved_value = conflict_data.internal_value
      target = 'external'
    } else if (resolution.choice === 'external') {
      resolved_value = conflict_data.external_value
      target = 'internal'
    } else if (resolution.choice === 'custom') {
      resolved_value = resolution.custom_value
      target = resolution.target || 'both'
    } else {
      continue // Skip invalid choices
    }

    all_resolutions[field_name] = {
      value: resolved_value,
      target,
      reason: 'manual_resolution'
    }

    applied_fields[field_name] = resolved_value
  }

  // Update conflict record
  await db('sync_conflicts').where({ conflict_id }).update({
    resolutions: all_resolutions,
    status: 'resolved',
    resolved_at: new Date(),
    resolved_by: user_id
  })

  // Apply resolutions
  const { internal_updates, external_updates } = await apply_resolutions({
    entity_id: sync_record.entity_id,
    resolutions: all_resolutions,
    update_external_entity: null,
    external_id: sync_record.external_id
  })

  return {
    conflict_id,
    entity_id: sync_record.entity_id,
    internal_updates,
    external_updates,
    resolved_fields: Object.keys(all_resolutions)
  }
}

export default {
  resolve_internal_wins,
  resolve_external_wins,
  resolve_newest_wins,
  queue_for_manual_resolution,
  detect_conflicts,
  resolve_entity_conflicts,
  apply_resolutions
}
