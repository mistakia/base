import debug from 'debug'
import db from '#db'
import { parse_json_if_possible } from '../shared/frontmatter-utils.mjs'

const log = debug('markdown:entity_export:data_fetchers')

/**
 * Generic entity data fetcher to reduce duplication
 *
 * @param {Object} params Fetcher parameters
 * @param {String} params.entity_id Entity ID
 * @param {Object} params.frontmatter Frontmatter object to populate
 * @param {String} params.table_name Table name to query
 * @param {Array} [params.exclude_fields] Fields to exclude from frontmatter
 * @param {Function} [params.transformer] Optional function to transform values
 */
export async function fetch_generic_entity_data({
  entity_id,
  frontmatter,
  table_name,
  exclude_fields = ['entity_id', 'search_vector'],
  transformer = null
}) {
  if (!table_name) {
    log('No table name provided for entity data fetching')
    return false
  }

  const entity_data = await db(table_name).where({ entity_id }).first()

  if (!entity_data) {
    log(`No data found for entity ${entity_id} in table ${table_name}`)
    return false
  }

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
 * Fetch task-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_task_data(entity_id, frontmatter) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    table_name: 'tasks'
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
    table_name: 'persons'
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
    table_name: 'organizations'
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
    table_name: 'physical_items'
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
    table_name: 'physical_locations'
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
    table_name: 'digital_items'
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
    table_name: 'guidelines'
  })
}

/**
 * Fetch activity-specific data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 */
export async function fetch_activity_data(entity_id, frontmatter) {
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    table_name: 'activities'
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
    table_name: 'tags'
  })
}

/**
 * Fetch database-related data from database
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter object to populate
 * @param {String} type Specific database type (database, database_item, database_view)
 */
export async function fetch_database_data(entity_id, frontmatter, type) {
  // Determine table name based on type
  let table_name

  switch (type) {
    case 'database':
      table_name = 'database_tables'
      break
    case 'database_item':
      table_name = 'database_table_items'
      break
    case 'database_view':
      table_name = 'database_table_views'
      break
    default:
      throw new Error(`Unknown database type: ${type}`)
  }

  // Use JSON parser transformer for specific fields
  await fetch_generic_entity_data({
    entity_id,
    frontmatter,
    table_name,
    transformer: parse_json_if_possible
  })
}

export default {
  fetch_generic_entity_data,
  fetch_task_data,
  fetch_person_data,
  fetch_organization_data,
  fetch_physical_item_data,
  fetch_physical_location_data,
  fetch_digital_item_data,
  fetch_guideline_data,
  fetch_activity_data,
  fetch_tag_data,
  fetch_database_data
}
