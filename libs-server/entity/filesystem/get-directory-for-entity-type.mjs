/**
 * Get directory name for entity type
 * Converts entity type identifiers to filesystem directory names
 */

/**
 * Get directory name for entity type
 * @param {string} entity_type - The entity type
 * @returns {string} Directory name
 */
export function get_directory_for_entity_type(entity_type) {
  // Convert entity type to directory name format
  switch (entity_type) {
    case 'physical_item':
      return 'physical-item'
    case 'digital_item':
      return 'digital-item'
    case 'physical_location':
      return 'physical-location'
    case 'database_table':
      return 'database-table'
    case 'database_view':
      return 'database-view'
    default:
      // For most types, just replace underscores with hyphens
      return entity_type.replace(/_/g, '-')
  }
}
