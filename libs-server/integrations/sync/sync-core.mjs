import debug from 'debug'
import db from '#db'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as json from 'multiformats/codecs/json'

const log = debug('sync:core')

/**
 * Create a CID (Content Identifier) for data object
 * Uses SHA-256 hash and JSON codec
 *
 * @param {Object} data_object - Data to create CID for
 * @returns {string} CID string
 */
export async function create_content_identifier(data_object) {
  const bytes = json.encode(data_object)
  const hash = await sha256.digest(bytes)
  const content_id = CID.create(1, json.code, hash)
  log(`Created content identifier for object: ${content_id}`)
  return content_id.toString()
}

/**
 * Detect changes between two data objects
 *
 * @param {Object} options - Function options
 * @param {Object} options.current_data - Current data object
 * @param {Object} options.previous_data - Previous data object
 * @returns {Object|null} Changes object or null if no changes
 */
export function detect_field_changes({ current_data, previous_data }) {
  if (!previous_data) return null

  const detected_changes = {}

  // Compare all fields directly
  const all_fields = new Set([
    ...Object.keys(current_data),
    ...Object.keys(previous_data)
  ])

  for (const field of all_fields) {
    const current_value = current_data[field]
    const previous_value = previous_data[field]

    if (
      format_value_for_comparison(current_value) !==
      format_value_for_comparison(previous_value)
    ) {
      detected_changes[field] = {
        from: previous_value,
        to: current_value,
        changed: true
      }
    }
  }

  return Object.keys(detected_changes).length > 0 ? detected_changes : null
}

/**
 * Format value for consistent comparison
 *
 * @param {any} value - Value to format
 * @returns {string} Formatted value
 */
export function format_value_for_comparison(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/**
 * Get sync configuration for an entity and external system
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity UUID
 * @param {string} options.external_system - Name of external system
 * @returns {Object} Sync configuration
 */
export async function get_entity_sync_config({ entity_id, external_system }) {
  // Get entity type
  const entity = await db('entities')
    .select('type')
    .where({ entity_id })
    .first()

  if (!entity) {
    throw new Error(`Entity ${entity_id} not found`)
  }

  // Get entity-specific config
  const entity_specific_config = await db('sync_configs')
    .where({
      entity_id,
      external_system
    })
    .first()

  if (entity_specific_config) {
    return entity_specific_config
  }

  // Get entity-type config
  const entity_type_config = await db('sync_configs')
    .where({
      entity_type: entity.type,
      external_system
    })
    .whereNull('entity_id')
    .first()

  if (entity_type_config) {
    return entity_type_config
  }

  // Create default config
  const default_field_strategies = {
    title: 'newest_wins',
    description: 'newest_wins',
    status: 'newest_wins',
    priority: 'newest_wins',
    start_by: 'newest_wins',
    finish_by: 'newest_wins',
    updated_at: 'newest_wins'
  }

  const [new_config] = await db('sync_configs')
    .insert({
      entity_type: entity.type,
      external_system,
      field_strategies: default_field_strategies
    })
    .returning('*')

  return new_config
}

/**
 * Update field last updated timestamps
 *
 * @param {Object} options - Function options
 * @param {string} options.sync_id - Sync record UUID
 * @param {Array|Object} options.updated_fields - Fields that were updated, can be array of field names or object with field names as keys
 * @param {string} [options.timestamp] - Optional timestamp to use for all fields, defaults to current time
 * @returns {Promise<void>}
 */
export async function update_field_last_updated_timestamps({
  sync_id,
  updated_fields,
  timestamp
}) {
  if (!updated_fields) {
    return
  }

  // Get current sync record
  const sync_record = await db('external_syncs').where({ sync_id }).first()

  if (!sync_record) {
    throw new Error(`Sync record ${sync_id} not found`)
  }

  // Update field timestamps
  const field_last_updated = sync_record.field_last_updated || {}
  const current_timestamp = timestamp || new Date().toISOString()

  // Handle both array and object inputs
  if (Array.isArray(updated_fields)) {
    for (const field_name of updated_fields) {
      field_last_updated[field_name] = current_timestamp
    }
  } else {
    for (const field_name of Object.keys(updated_fields)) {
      field_last_updated[field_name] = current_timestamp
    }
  }

  // Update sync record
  await db('external_syncs').where({ sync_id }).update({
    field_last_updated,
    last_internal_update_at: current_timestamp
  })
}

/**
 * Get entity data including extension table data
 *
 * @param {Object} entity - Entity object
 * @returns {Object} Entity with extension data
 */
export async function get_entity_data_with_extensions(entity) {
  try {
    // Get extension table data
    const extension_table = `${entity.type}s`
    const extension_data = await db(extension_table)
      .where({ entity_id: entity.entity_id })
      .first()

    return { ...entity, ...(extension_data || {}) }
  } catch (error) {
    // Handle case when table doesn't exist
    if (error.code === '42P01') {
      // PostgreSQL error code for undefined_table
      log(
        `Extension table for type '${entity.type}' does not exist. Returning entity data only.`
      )
      return entity
    }
    // Re-throw other errors
    throw error
  }
}
