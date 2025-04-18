import debug from 'debug'
import db from '#db'
import { entity_registry } from './index.mjs'

const log = debug('markdown:entity_converter:data_fetchers')

/**
 * Generic entity data fetcher to reduce duplication
 *
 * @param {Object} params Fetcher parameters
 * @param {String} params.entity_id Entity ID
 * @param {Object} params.frontmatter Frontmatter object to populate
 * @param {String} params.entity_type Entity type for registry lookup
 * @param {String} [params.table_name] Optional override for table name
 * @param {Array} [params.exclude_fields] Fields to exclude from frontmatter
 * @param {Function} [params.transformer] Optional function to transform values
 */
export async function fetch_generic_entity_data({
  entity_id,
  frontmatter,
  entity_type,
  table_name = null,
  exclude_fields = ['entity_id', 'search_vector'],
  transformer = null
}) {
  // Get table name from registry if not provided explicitly
  const actual_table =
    table_name ||
    (entity_registry[entity_type] ? entity_registry[entity_type].table : null)

  if (!actual_table) {
    log(`No table name found for entity type: ${entity_type}`)
    return false
  }

  const entity_data = await db(actual_table).where({ entity_id }).first()

  if (!entity_data) return false

  // Add entity-specific fields to frontmatter
  Object.entries(entity_data).forEach(([key, value]) => {
    if (value !== null && !exclude_fields.includes(key)) {
      // Apply custom transformation if provided
      if (transformer && typeof transformer === 'function') {
        frontmatter[key] = transformer(key, value)
      } else {
        frontmatter[key] = value
      }
    }
  })

  return true
}

/**
 * Parse JSON string value if possible
 * @param {String} key Field key
 * @param {any} value Field value
 * @returns {any} Parsed value or original
 */
function json_parser(key, value) {
  if (
    typeof value === 'string' &&
    (key === 'fields' || key === 'field_values' || key === 'table_state')
  ) {
    try {
      return JSON.parse(value)
    } catch (err) {
      return value
    }
  }
  return value
}

/**
 * Fetch task-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_task_data(entity_id, frontmatter) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    entity_type: 'task'
  })
}

/**
 * Fetch person-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_person_data(entity_id, frontmatter) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    entity_type: 'person'
  })
}

/**
 * Fetch organization-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_organization_data(entity_id, frontmatter) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    entity_type: 'organization'
  })
}

/**
 * Fetch physical_item-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_physical_item_data(entity_id, frontmatter) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    entity_type: 'physical_item'
  })
}

/**
 * Fetch physical_location-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_physical_location_data(entity_id, frontmatter) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    entity_type: 'physical_location'
  })
}

/**
 * Fetch digital_item-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_digital_item_data(entity_id, frontmatter) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    entity_type: 'digital_item'
  })
}

/**
 * Fetch guideline-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_guideline_data(entity_id, frontmatter) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    entity_type: 'guideline'
  })
}

/**
 * Fetch activity-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_activity_data(entity_id, frontmatter) {
  // Activity table doesn't have specific fields beyond entity_id
  // Just verify the record exists
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    entity_type: 'activity'
  })
}

/**
 * Fetch tag-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_tag_data(entity_id, frontmatter) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    entity_type: 'tag'
  })
}

/**
 * Fetch database-related data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 * @param {String} type Specific database type (database, database_item, database_view)
 */
export async function fetch_database_data(entity_id, frontmatter, type) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    entity_type: type,
    transformer: json_parser
  })
}
