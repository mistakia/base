import debug from 'debug'
import db from '#db'
import {
  get_entity_sync_config,
  get_entity_data_with_extensions
} from '../core/index.mjs'

const log = debug('sync:conflict:resolution')

/**
 * Resolution strategies
 */
export const resolution_strategies = {
  internal_wins: 'internal_wins',
  external_wins: 'external_wins',
  newest_wins: 'newest_wins',
  manual: 'manual'
}

/**
 * Resolve conflict by keeping internal value
 *
 * @param {Object} conflict - Conflict information
 * @param {any} conflict.internal_value - Internal value
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
 * @param {any} conflict.external_value - External value
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
 *
 * @param {Object} conflict - Conflict information
 * @param {boolean} conflict.changed_in_current_import - Whether field changed
 * @param {string} conflict.internal_updated_at - Internal update timestamp
 * @param {string} conflict.external_updated_at - External update timestamp
 * @param {any} conflict.internal_value - Internal value
 * @param {any} conflict.external_value - External value
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

  const internal_date = new Date(internal_updated_at)
  const external_date = new Date(external_updated_at)

  if (external_date > internal_date) {
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
 * @param {any} conflict.internal_value - Internal value
 * @param {any} conflict.external_value - External value
 * @param {string} conflict.internal_updated_at - Internal update timestamp
 * @param {string} conflict.external_updated_at - External update timestamp
 * @param {string} conflict.field_name - Field name
 * @returns {Promise<Object>} Resolution result
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
  try {
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
    const existing_conflicts = conflict_record.conflicts || {}
    const updated_conflicts = {
      ...existing_conflicts,
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
  } catch (error) {
    log(`Error queueing for manual resolution: ${error.message}`)
    throw error
  }
}

/**
 * Resolve entity conflicts
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity ID
 * @param {Object} options.conflicts - Detected conflicts
 * @param {string} options.external_system - External system
 * @param {string} [options.manual_resolutions=null] - Manual resolutions
 * @returns {Promise<Object>} Resolution result
 */
export async function resolve_entity_conflicts({
  entity_id,
  conflicts,
  external_system,
  manual_resolutions = null
}) {
  try {
    log(`Resolving conflicts for entity ${entity_id}`)

    if (!entity_id || !conflicts || !external_system) {
      throw new Error('Missing required parameters')
    }

    // Get sync config for resolution strategies
    const sync_config = await get_entity_sync_config({
      entity_id,
      external_system
    })

    const field_strategies = sync_config.field_strategies || {}
    const resolutions = {}

    // Process each conflict
    for (const [field, conflict] of Object.entries(conflicts)) {
      // Check if there's a manual resolution
      if (manual_resolutions && manual_resolutions[field]) {
        const manual_choice = manual_resolutions[field]

        if (manual_choice === 'internal') {
          resolutions[field] = resolve_internal_wins({
            internal_value: conflict.internal_value
          })
        } else if (manual_choice === 'external') {
          resolutions[field] = resolve_external_wins({
            external_value: conflict.external_value
          })
        } else {
          log(`Unknown manual resolution choice: ${manual_choice}`)
        }

        continue
      }

      // Get strategy for this field
      const field_strategy = field_strategies[field] || 'newest_wins'

      // Apply strategy
      switch (field_strategy) {
        case 'internal_wins':
          resolutions[field] = resolve_internal_wins({
            internal_value: conflict.internal_value
          })
          break

        case 'external_wins':
          resolutions[field] = resolve_external_wins({
            external_value: conflict.external_value
          })
          break

        case 'newest_wins':
          resolutions[field] = resolve_newest_wins({
            changed_in_current_import: true,
            internal_updated_at: conflict.internal_updated_at || new Date(0),
            external_updated_at: conflict.external_updated_at || new Date(0),
            internal_value: conflict.internal_value,
            external_value: conflict.external_value
          })
          break

        case 'manual':
          resolutions[field] = await queue_for_manual_resolution({
            sync_id: conflict.sync_id,
            import_cid: conflict.import_cid,
            internal_value: conflict.internal_value,
            external_value: conflict.external_value,
            internal_updated_at: conflict.internal_updated_at || new Date(0),
            external_updated_at: conflict.external_updated_at || new Date(0),
            field_name: field
          })
          break

        default:
          log(
            `Unknown resolution strategy: ${field_strategy}, defaulting to newest_wins`
          )
          resolutions[field] = resolve_newest_wins({
            changed_in_current_import: true,
            internal_updated_at: conflict.internal_updated_at || new Date(0),
            external_updated_at: conflict.external_updated_at || new Date(0),
            internal_value: conflict.internal_value,
            external_value: conflict.external_value
          })
      }
    }

    return {
      entity_id,
      resolutions,
      external_system
    }
  } catch (error) {
    log(`Error resolving entity conflicts: ${error.message}`)
    throw error
  }
}

/**
 * Apply conflict resolutions to entity
 *
 * @param {Object} options - Function options
 * @param {Object} options.entity - Entity to update
 * @param {Object} options.resolutions - Conflict resolutions
 * @returns {Promise<Object>} Updated entity
 */
export async function apply_resolutions({ entity, resolutions }) {
  try {
    log(`Applying resolutions to entity ${entity.entity_id}`)

    if (!entity || !resolutions) {
      throw new Error('Missing required parameters')
    }

    const entity_data = await get_entity_data_with_extensions(entity)
    const updated_fields = []

    // Apply resolutions
    for (const [field, resolution] of Object.entries(resolutions)) {
      if (resolution.target === 'internal') {
        // Update internal value
        entity_data[field] = resolution.value
        updated_fields.push(field)
      }
    }

    return {
      entity_data,
      updated_fields
    }
  } catch (error) {
    log(`Error applying resolutions: ${error.message}`)
    throw error
  }
}

/**
 * Manually resolve conflicts
 *
 * @param {Object} options - Function options
 * @param {string} options.conflict_id - Conflict ID
 * @param {Object} options.resolutions - Field resolutions {field: 'internal'|'external'}
 * @returns {Promise<Object>} Updated conflict record
 */
export async function manual_resolve_conflicts({ conflict_id, resolutions }) {
  try {
    log(`Manually resolving conflict ${conflict_id}`)

    if (!conflict_id || !resolutions) {
      throw new Error('Missing required parameters')
    }

    // Get conflict record
    const conflict_record = await db('sync_conflicts')
      .where({ conflict_id })
      .first()

    if (!conflict_record) {
      throw new Error(`Conflict record ${conflict_id} not found`)
    }

    // Apply resolutions
    const existing_conflicts = conflict_record.conflicts || {}
    const updated_conflicts = { ...existing_conflicts }
    let all_resolved = true

    for (const [field, resolution_choice] of Object.entries(resolutions)) {
      if (!updated_conflicts[field]) {
        log(`Field ${field} not found in conflicts`)
        continue
      }

      if (resolution_choice === 'internal') {
        updated_conflicts[field].resolution = {
          target: 'external',
          value: updated_conflicts[field].internal_value,
          reason: 'manual_internal'
        }
      } else if (resolution_choice === 'external') {
        updated_conflicts[field].resolution = {
          target: 'internal',
          value: updated_conflicts[field].external_value,
          reason: 'manual_external'
        }
      } else {
        log(`Unknown resolution choice: ${resolution_choice}`)
        all_resolved = false
      }
    }

    // Update conflict record
    await db('sync_conflicts')
      .where({ conflict_id })
      .update({
        conflicts: updated_conflicts,
        status: all_resolved ? 'resolved' : 'partial',
        resolved_at: all_resolved ? new Date() : null
      })

    // Get updated record
    const updated_record = await db('sync_conflicts')
      .where({ conflict_id })
      .first()

    return updated_record
  } catch (error) {
    log(`Error manually resolving conflicts: ${error.message}`)
    throw error
  }
}
