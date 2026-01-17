/**
 * Query Entities
 *
 * Core query function for entities with DuckDB/filesystem routing.
 */

import debug from 'debug'
import {
  query_entities_from_duckdb,
  get_entity_by_base_uri,
  get_entity_by_id
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'

const log = debug('base:entity:query')

/**
 * Query entities with filtering, sorting, and pagination
 *
 * @param {Object} params - Query parameters
 * @param {string[]} [params.types] - Entity types to filter
 * @param {string} [params.status] - Status filter
 * @param {string} [params.priority] - Priority filter
 * @param {string[]} [params.tags] - Tag base_uris to filter by
 * @param {boolean} [params.no_tags] - Return only entities without tags
 * @param {boolean} [params.include_archived] - Include archived entities
 * @param {string} [params.search] - Search term for title/description
 * @param {string[]} [params.fields] - Fields to return
 * @param {number} [params.limit=50] - Max results
 * @param {number} [params.offset=0] - Offset for pagination
 * @param {string} [params.sort_by] - Field to sort by
 * @param {boolean} [params.sort_desc=false] - Sort descending
 * @returns {Promise<Object[]>} Array of entity objects
 */
export async function query_entities({
  types,
  status,
  priority,
  tags,
  no_tags = false,
  include_archived = false,
  search,
  fields,
  limit = 50,
  offset = 0,
  sort_by = 'updated_at',
  sort_desc = true
} = {}) {
  log('Querying entities with filters')

  const filters = []

  // Type filter
  if (types && types.length > 0) {
    filters.push({
      column_id: 'type',
      operator: 'IN',
      value: types
    })
  }

  // Status filter
  if (status) {
    filters.push({
      column_id: 'status',
      operator: '=',
      value: status
    })
  }

  // Priority filter
  if (priority) {
    filters.push({
      column_id: 'priority',
      operator: '=',
      value: priority
    })
  }

  // Archived filter
  if (!include_archived) {
    filters.push({
      column_id: 'archived',
      operator: '=',
      value: false
    })
  }

  // Search filter (title/description)
  if (search) {
    filters.push({
      column_id: 'title',
      operator: 'LIKE',
      value: search
    })
  }

  // Tag filters
  if (tags && tags.length > 0) {
    filters.push({
      column_id: 'tags',
      operator: 'IN',
      value: tags
    })
  }

  // No tags filter
  if (no_tags) {
    filters.push({
      column_id: 'tags',
      operator: 'IS_EMPTY'
    })
  }

  const sort = sort_by
    ? [{ column_id: sort_by, desc: sort_desc }]
    : [{ column_id: 'updated_at', desc: true }]

  try {
    const results = await query_entities_from_duckdb({
      filters,
      sort,
      limit,
      offset
    })

    // Filter fields if specified
    if (fields && fields.length > 0) {
      return results.map((entity) => {
        const filtered = {}
        for (const field of fields) {
          if (entity[field] !== undefined) {
            filtered[field] = entity[field]
          }
        }
        return filtered
      })
    }

    return results
  } catch (error) {
    log('Error querying entities: %s', error.message)
    throw error
  }
}

/**
 * Query a single entity by base_uri or entity_id
 *
 * @param {Object} params - Query parameters
 * @param {string} [params.base_uri] - Entity base URI
 * @param {string} [params.entity_id] - Entity UUID
 * @returns {Promise<Object|null>} Entity object or null
 */
export async function query_single_entity({ base_uri, entity_id }) {
  log('Querying single entity: %s', base_uri || entity_id)

  try {
    if (base_uri) {
      return await get_entity_by_base_uri({ base_uri })
    }

    if (entity_id) {
      return await get_entity_by_id({ entity_id })
    }

    return null
  } catch (error) {
    log('Error querying single entity: %s', error.message)
    throw error
  }
}
