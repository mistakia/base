/**
 * Entity Constants
 *
 * This file contains constants related to entity types and operations.
 * Entity types are defined in system schema files (sys:system/schema/).
 */

/**
 * Entity types defined in the system schema
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

/**
 * Color mapping for entity types used in UI labels
 * @type {Object.<string, string>}
 */
export const ENTITY_TYPE_COLORS = {
  [ENTITY_TYPES.TASK]: '#2196f3',
  [ENTITY_TYPES.TEXT]: '#78909c',
  [ENTITY_TYPES.WORKFLOW]: '#9c27b0',
  [ENTITY_TYPES.GUIDELINE]: '#4caf50',
  [ENTITY_TYPES.TAG]: '#ff9800',
  thread: '#00bcd4',
  [ENTITY_TYPES.PHYSICAL_ITEM]: '#795548',
  [ENTITY_TYPES.PHYSICAL_LOCATION]: '#607d8b',
  [ENTITY_TYPES.PERSON]: '#e91e63',
  [ENTITY_TYPES.DATABASE]: '#3f51b5',
  [ENTITY_TYPES.DATABASE_ITEM]: '#3f51b5',
  [ENTITY_TYPES.DATABASE_VIEW]: '#3f51b5',
  [ENTITY_TYPES.DIGITAL_ITEM]: '#009688',
  [ENTITY_TYPES.ORGANIZATION]: '#ff5722',
  [ENTITY_TYPES.PROMPT]: '#78909c',
  [ENTITY_TYPES.TYPE_DEFINITION]: '#78909c',
  [ENTITY_TYPES.TYPE_EXTENSION]: '#78909c'
}

const DEFAULT_TYPE_COLOR = '#bdbdbd'

/**
 * Get the color for an entity type
 * @param {string} type - The entity type
 * @returns {string} - Hex color string
 */
export function get_entity_type_color(type) {
  return ENTITY_TYPE_COLORS[type] || DEFAULT_TYPE_COLOR
}

/**
 * Shortened display labels for entity types
 * @type {Object.<string, string>}
 */
export const ENTITY_TYPE_DISPLAY_LABELS = {
  [ENTITY_TYPES.PHYSICAL_ITEM]: 'item',
  [ENTITY_TYPES.PHYSICAL_LOCATION]: 'location',
  [ENTITY_TYPES.DATABASE_ITEM]: 'db item',
  [ENTITY_TYPES.DATABASE_VIEW]: 'db view',
  [ENTITY_TYPES.TYPE_DEFINITION]: 'type def',
  [ENTITY_TYPES.TYPE_EXTENSION]: 'type ext',
  [ENTITY_TYPES.DIGITAL_ITEM]: 'digital'
}

/**
 * Get the display label for an entity type
 * @param {string} type - The entity type
 * @returns {string} - Display label string
 */
export function get_entity_type_display_label(type) {
  return ENTITY_TYPE_DISPLAY_LABELS[type] || type || ''
}

/**
 * URI path segment to entity type mapping
 * @type {Object.<string, string>}
 */
const URI_PATH_TYPE_MAP = {
  task: ENTITY_TYPES.TASK,
  text: ENTITY_TYPES.TEXT,
  workflow: ENTITY_TYPES.WORKFLOW,
  guideline: ENTITY_TYPES.GUIDELINE,
  tag: ENTITY_TYPES.TAG,
  'physical-item': ENTITY_TYPES.PHYSICAL_ITEM,
  'physical-location': ENTITY_TYPES.PHYSICAL_LOCATION,
  person: ENTITY_TYPES.PERSON,
  organization: ENTITY_TYPES.ORGANIZATION,
  'digital-item': ENTITY_TYPES.DIGITAL_ITEM,
  database: ENTITY_TYPES.DATABASE,
  prompt: ENTITY_TYPES.PROMPT
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Infer entity type from a base_uri path pattern
 * @param {string} base_uri - The base URI (e.g., 'user:task/my-task.md')
 * @returns {string|null} - The inferred entity type or null
 */
export function infer_entity_type_from_base_uri(base_uri) {
  if (!base_uri) return null

  // Remove scheme prefix (user:, sys:, etc.)
  const path = base_uri.includes(':')
    ? base_uri.split(':').slice(1).join(':')
    : base_uri

  // Get the first path segment
  const first_segment = path.split('/')[0]

  // Check for UUID pattern (threads)
  if (UUID_PATTERN.test(first_segment)) {
    return 'thread'
  }

  // Check for system schema paths like system/schema/...
  if (path.startsWith('system/schema/')) {
    return ENTITY_TYPES.TYPE_DEFINITION
  }

  if (path.startsWith('system/workflow/')) {
    return ENTITY_TYPES.WORKFLOW
  }

  if (path.startsWith('system/guideline/')) {
    return ENTITY_TYPES.GUIDELINE
  }

  return URI_PATH_TYPE_MAP[first_segment] || null
}

export default {
  ENTITY_TYPES,
  ENTITY_TYPE_TABLES,
  ENTITY_TYPES_WITHOUT_TABLES,
  has_dedicated_table,
  get_table_for_entity_type,
  ENTITY_TYPE_COLORS,
  get_entity_type_color,
  ENTITY_TYPE_DISPLAY_LABELS,
  get_entity_type_display_label,
  infer_entity_type_from_base_uri
}
