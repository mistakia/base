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
  'user_public_key',
  'external_id'
])

/**
 * Properties that are managed locally and not synced from external systems
 * These properties should never be removed or overwritten by external imports
 */
const LOCAL_ONLY_PROPERTIES = new Set([
  'tags',
  'relations',
  'observations',
  'base_uri', // Local filesystem path identifier
  'import_cid', // Content identifier for import tracking
  'public_read' // Local access control setting
])

/**
 * Properties that should be preserved if they exist, even if not in new external data
 * These are typically metadata properties that may be set from different import sources
 * (e.g., project imports vs issue imports) and should be preserved across imports
 */
const PRESERVE_IF_EXISTS_PROPERTIES = new Set([
  'github_project_item_id', // Preserve project item ID even when importing from issues
  'github_project_number', // Preserve project number even when importing from issues
  'github_graphql_id', // Preserve GraphQL node ID even when importing from REST API
  'priority', // Preserve priority set from projects even when importing from issues
  'finish_by', // Preserve due date from projects even when importing from issues
  'start_by' // Preserve start date from projects even when importing from issues
])

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
      // Not a preserve-if-exists property (preserve metadata from other import sources)
      !PRESERVE_IF_EXISTS_PROPERTIES.has(key) &&
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
 * Add a property to the preserve-if-exists properties set
 * Use this for properties that should be preserved if they exist, even if not in new external data
 *
 * @param {string} property_name - Property name to preserve if exists
 */
export function add_preserve_if_exists_property(property_name) {
  PRESERVE_IF_EXISTS_PROPERTIES.add(property_name)
}

/**
 * Get the current set of preserve-if-exists properties
 *
 * @returns {Set<string>} Preserve-if-exists property names
 */
export function get_preserve_if_exists_properties() {
  return new Set(PRESERVE_IF_EXISTS_PROPERTIES)
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
