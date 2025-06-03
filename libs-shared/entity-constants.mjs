/**
 * Entity Constants
 *
 * This file contains constants related to entity types and operations.
 * The entity types match the PostgreSQL enum definition in the database schema.
 */

/**
 * Entity types defined in the database schema
 * @enum {string}
 */
export const ENTITY_TYPES = {
  WORKFLOW: 'workflow',
  DATABASE: 'database',
  DATABASE_ITEM: 'database_item',
  DATABASE_VIEW: 'database_view',
  DIGITAL_ITEM: 'digital_item',
  GUIDELINE: 'guideline',
  ORGANIZATION: 'organization',
  PERSON: 'person',
  PHYSICAL_ITEM: 'physical_item',
  PHYSICAL_LOCATION: 'physical_location',
  PROMPT: 'prompt',
  TAG: 'tag',
  TASK: 'task',
  TEXT: 'text',
  TYPE_DEFINITION: 'type_definition',
  TYPE_EXTENSION: 'type_extension'
}

/**
 * Maps entity types to their corresponding database tables
 * @type {Object.<string, string>}
 */
export const ENTITY_TYPE_TABLES = {
  [ENTITY_TYPES.WORKFLOW]: 'workflows',
  [ENTITY_TYPES.DATABASE]: 'database_tables',
  [ENTITY_TYPES.DATABASE_ITEM]: 'database_table_items',
  [ENTITY_TYPES.DATABASE_VIEW]: 'database_table_views',
  [ENTITY_TYPES.DIGITAL_ITEM]: 'digital_items',
  [ENTITY_TYPES.GUIDELINE]: 'guidelines',
  [ENTITY_TYPES.ORGANIZATION]: 'organizations',
  [ENTITY_TYPES.PERSON]: 'persons',
  [ENTITY_TYPES.PHYSICAL_ITEM]: 'physical_items',
  [ENTITY_TYPES.PHYSICAL_LOCATION]: 'physical_locations',
  [ENTITY_TYPES.TAG]: 'tags',
  [ENTITY_TYPES.TASK]: 'tasks'
  // Note: TEXT, PROMPT, TYPE_DEFINITION, and TYPE_EXTENSION don't have dedicated tables
}

/**
 * Entity types that don't have dedicated tables in the database
 * @type {Array<string>}
 */
export const ENTITY_TYPES_WITHOUT_TABLES = [
  ENTITY_TYPES.TEXT,
  ENTITY_TYPES.PROMPT,
  ENTITY_TYPES.TYPE_DEFINITION,
  ENTITY_TYPES.TYPE_EXTENSION
]

/**
 * Check if an entity type has a dedicated table
 * @param {string} entity_type - The entity type to check
 * @returns {boolean} - True if the entity type has a dedicated table
 */
export function has_dedicated_table(entity_type) {
  return entity_type in ENTITY_TYPE_TABLES
}

/**
 * Get the table name for an entity type
 * @param {string} entity_type - The entity type
 * @returns {string|null} - The table name or null if no dedicated table exists
 */
export function get_table_for_entity_type(entity_type) {
  return ENTITY_TYPE_TABLES[entity_type] || null
}

export default {
  ENTITY_TYPES,
  ENTITY_TYPE_TABLES,
  ENTITY_TYPES_WITHOUT_TABLES,
  has_dedicated_table,
  get_table_for_entity_type
}
