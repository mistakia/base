import debug from 'debug'

const log = debug('sync:core:field-timestamps')

/**
 * Update field last updated timestamps for an entity
 *
 * @param {Object} options - Function options
 * @param {Object} options.entity_data - Entity data to update
 * @param {Array|Object} options.updated_fields - Field names that were updated
 * @param {Date|string} [options.timestamp=null] - Optional specific timestamp to use
 * @returns {Object} Updated entity data with field_last_updated
 */
export function update_field_last_updated_timestamps({
  entity_data,
  updated_fields,
  timestamp = null
}) {
  if (!entity_data) {
    log('No entity data provided')
    return entity_data
  }

  // Initialize field_last_updated if not present
  if (!entity_data.field_last_updated) {
    entity_data.field_last_updated = {}
  }

  const current_timestamp = timestamp || new Date().toISOString()

  // Handle both array and object input formats
  if (Array.isArray(updated_fields)) {
    for (const field_name of updated_fields) {
      entity_data.field_last_updated[field_name] = current_timestamp
    }
  } else if (typeof updated_fields === 'object') {
    for (const field_name of Object.keys(updated_fields)) {
      entity_data.field_last_updated[field_name] = current_timestamp
    }
  } else {
    log('Invalid updated_fields format')
  }

  return entity_data
}

/**
 * Update field timestamps in entity properties
 * Filesystem-specific version of update_field_last_updated_timestamps
 *
 * @param {Object} entity_properties - Entity properties to update
 * @param {Object|Array} updated_fields - Fields that were updated
 * @param {string} [timestamp] - Optional timestamp to use
 * @returns {Object} Updated entity properties
 */
export function update_filesystem_field_timestamps(
  entity_properties,
  updated_fields,
  timestamp
) {
  if (!entity_properties.field_last_updated) {
    entity_properties.field_last_updated = {}
  }

  const current_timestamp = timestamp || new Date().toISOString()

  // Handle both array and object inputs
  if (Array.isArray(updated_fields)) {
    for (const field_name of updated_fields) {
      entity_properties.field_last_updated[field_name] = current_timestamp
    }
  } else {
    for (const field_name of Object.keys(updated_fields)) {
      entity_properties.field_last_updated[field_name] = current_timestamp
    }
  }

  return entity_properties
}
