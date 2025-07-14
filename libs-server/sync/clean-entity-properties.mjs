import debug from 'debug'

const log = debug('sync:clean-properties')

/**
 * Properties that should never be removed from entities (core properties)
 */
const PROTECTED_PROPERTIES = new Set([
  'entity_id',
  'type',
  'name',
  'title',
  'created_at',
  'updated_at',
  'user_id',
  'external_id'
])

/**
 * Properties that are managed locally and not synced from external systems
 */
const LOCAL_ONLY_PROPERTIES = new Set(['tags', 'relations', 'observations'])

/**
 * Remove stale properties that are no longer present in external data
 * This ensures entities don't accumulate outdated properties from external systems
 *
 * @param {Object} existing_properties - Current entity properties
 * @param {Object} new_properties - New properties from external system
 * @param {string} external_system - External system identifier (e.g., 'notion', 'github')
 * @returns {Object} Properties with stale external properties removed
 */
export function remove_stale_external_properties(
  existing_properties,
  new_properties,
  external_system
) {
  const cleaned = { ...existing_properties }

  // Only process entities that belong to this external system
  if (
    !existing_properties.external_id ||
    !existing_properties.external_id.includes(external_system)
  ) {
    return cleaned
  }

  // Find properties that exist in current entity but not in new external data
  for (const [key, value] of Object.entries(existing_properties)) {
    const should_remove =
      // Property not in new external data
      !(key in new_properties) &&
      // Not a protected core property
      !PROTECTED_PROPERTIES.has(key) &&
      // Not a local-only property
      !LOCAL_ONLY_PROPERTIES.has(key) &&
      // Not undefined/null (already clean)
      value !== undefined &&
      value !== null

    if (should_remove) {
      log(
        `Removing stale external property '${key}' from ${external_system} entity`
      )
      delete cleaned[key]
    }
  }

  return cleaned
}

/**
 * Add a property to the protected properties set
 * Use this if you need to protect additional properties from removal
 *
 * @param {string} property_name - Property name to protect
 */
export function add_protected_property(property_name) {
  PROTECTED_PROPERTIES.add(property_name)
}

/**
 * Add a property to the local-only properties set
 * Use this for properties that should never be overwritten by external systems
 *
 * @param {string} property_name - Property name to mark as local-only
 */
export function add_local_only_property(property_name) {
  LOCAL_ONLY_PROPERTIES.add(property_name)
}

/**
 * Get the current set of protected properties
 *
 * @returns {Set<string>} Protected property names
 */
export function get_protected_properties() {
  return new Set(PROTECTED_PROPERTIES)
}

/**
 * Get the current set of local-only properties
 *
 * @returns {Set<string>} Local-only property names
 */
export function get_local_only_properties() {
  return new Set(LOCAL_ONLY_PROPERTIES)
}
