/**
 * Entity API Routes
 *
 * Provides unified entity query and relations endpoints.
 */

import express from 'express'
import debug from 'debug'

import { parse_array_param } from '#server/utils/query-params.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  find_related_entities,
  find_entities_relating_to
} from '#libs-server/embedded-database-index/duckdb/duckdb-relation-queries.mjs'
import {
  query_entities_from_duckdb,
  get_entity_by_base_uri,
  get_entity_by_id,
  count_entities_in_duckdb
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'
import { PermissionContext } from '#server/middleware/permission/permission-context.mjs'
import {
  redact_base_uri,
  redact_entity_object,
  DEFAULT_REDACTED_STRING
} from '#server/middleware/content-redactor.mjs'

const log = debug('api:entities')
const router = express.Router({ mergeParams: true })

/**
 * Apply permission-based redaction to relations array
 * Returns all relations, but redacts those the user cannot access
 * @param {Object} params
 * @param {Array} params.relations - Array of relation objects with base_uri
 * @param {PermissionContext} params.permission_context - Permission context for checking access
 * @returns {Promise<Array>} Array of relations with unauthorized ones redacted
 */
async function redact_relations_by_permission({
  relations,
  permission_context
}) {
  if (!relations || relations.length === 0) {
    return []
  }

  const results = await Promise.all(
    relations.map(async (relation, index) => {
      if (!relation.base_uri) {
        return {
          relation_type: relation.relation_type || null,
          base_uri: DEFAULT_REDACTED_STRING,
          redacted: true,
          unique_key: `redacted-api-${index}`
        }
      }

      const result = await permission_context.check_permission({
        resource_path: relation.base_uri
      })

      if (result.read.allowed) {
        return relation
      }

      // Return redacted placeholder for unauthorized relations
      // Preserve relation_type and redact base_uri (keeping only `-` characters)
      return {
        relation_type: relation.relation_type || null,
        base_uri: redact_base_uri(relation.base_uri),
        redacted: true,
        unique_key: `redacted-api-${index}`
      }
    })
  )

  return results
}

/**
 * Apply permission-based filtering to entities
 * Returns entities with unauthorized ones redacted
 * @param {Object} params
 * @param {Array} params.entities - Array of entity objects
 * @param {PermissionContext} params.permission_context - Permission context
 * @returns {Promise<Array>} Array of entities with unauthorized ones redacted
 */
async function filter_entities_by_permission({ entities, permission_context }) {
  if (!entities || entities.length === 0) return []

  const results = await Promise.all(
    entities.map(async (entity) => {
      if (!entity.base_uri) {
        return redact_entity_object(entity)
      }

      const result = await permission_context.check_permission({
        resource_path: entity.base_uri
      })

      if (result.read.allowed) {
        return entity
      }

      return redact_entity_object(entity)
    })
  )

  return results
}

/**
 * GET /api/entities
 *
 * Query entities with filtering, pagination, and sorting.
 * Supports single entity lookup by base_uri or entity_id.
 *
 * Query params:
 * - base_uri: Single entity lookup by base URI
 * - entity_id: Single entity lookup by UUID
 * - type: Entity type(s) to filter (comma-separated or repeated)
 * - status: Status filter
 * - priority: Priority filter
 * - archived: Include archived entities (default: false)
 * - search: Title LIKE search
 * - tags: Tag base_uris to filter by (comma-separated or repeated)
 * - without_tags: Return only entities without tags (default: false)
 * - limit: Max results (default: 50, max: 1000)
 * - offset: Pagination offset (default: 0)
 * - sort: Sort field (default: updated_at)
 * - sort_desc: Sort descending (default: true)
 */
router.get('/', async (req, res) => {
  try {
    const user_public_key = req.user?.user_public_key || null

    const {
      base_uri,
      entity_id,
      status,
      priority,
      archived,
      search,
      without_tags,
      sort = 'updated_at',
      sort_desc = 'true'
    } = req.query

    const types = parse_array_param(req.query.type)
    const tags = parse_array_param(req.query.tags)
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 1000)
    const offset = parseInt(req.query.offset, 10) || 0
    const sort_descending = sort_desc === 'true'
    const include_archived = archived === 'true'
    const without_tags_filter = without_tags === 'true'

    // Check if DuckDB is available
    if (!embedded_index_manager.is_duckdb_ready()) {
      return res.status(503).send({ error: 'Database not available' })
    }

    const permission_context = new PermissionContext({ user_public_key })

    // Single entity lookup mode
    if (base_uri || entity_id) {
      let entity = null

      if (base_uri) {
        entity = await get_entity_by_base_uri({ base_uri })
      } else if (entity_id) {
        entity = await get_entity_by_id({ entity_id })
      }

      if (!entity) {
        return res.send({ entities: [], total: 0, limit, offset })
      }

      // Check permission
      const permission_result = await permission_context.check_permission({
        resource_path: entity.base_uri
      })

      if (!permission_result.read.allowed) {
        entity = redact_entity_object(entity)
      }

      return res.send({ entities: [entity], total: 1, limit, offset })
    }

    // Build filters for query
    const filters = []

    if (types.length > 0) {
      filters.push({ column_id: 'type', operator: 'IN', value: types })
    }

    if (status) {
      filters.push({ column_id: 'status', operator: '=', value: status })
    }

    if (priority) {
      filters.push({ column_id: 'priority', operator: '=', value: priority })
    }

    if (!include_archived) {
      filters.push({ column_id: 'archived', operator: '=', value: false })
    }

    if (search) {
      filters.push({ column_id: 'title', operator: 'LIKE', value: search })
    }

    if (tags.length > 0 && !without_tags_filter) {
      filters.push({ column_id: 'tags', operator: 'IN', value: tags })
    }

    if (without_tags_filter) {
      filters.push({ column_id: 'tags', operator: 'IS_EMPTY' })
    }

    const sort_config = [{ column_id: sort, desc: sort_descending }]

    // Query entities and count
    const [entities, total] = await Promise.all([
      query_entities_from_duckdb({ filters, sort: sort_config, limit, offset }),
      count_entities_in_duckdb({ filters })
    ])

    // Apply permission-based filtering
    const filtered_entities = await filter_entities_by_permission({
      entities,
      permission_context
    })

    log(
      'Entity query: %d entities returned (with permission filtering)',
      filtered_entities.length
    )

    res.send({
      entities: filtered_entities,
      total,
      limit,
      offset
    })
  } catch (error) {
    log('Error querying entities: %s', error.message)
    res.status(500).send({ error: error.message })
  }
})

/**
 * GET /api/entities/relations
 *
 * Query entity relations with direction and type filtering.
 *
 * Query params:
 * - base_uri (required): Entity base URI to query relations for
 * - direction: 'forward' | 'reverse' | 'both' (default: 'both')
 * - relation_type: Filter by relation type
 * - entity_type: Filter by target/source entity type
 * - limit: Max results per direction (default: 50)
 * - offset: Pagination offset
 */
router.get('/relations', async (req, res) => {
  try {
    // Allow unauthenticated requests - permission context will handle access control
    const user_public_key = req.user?.user_public_key || null

    const {
      base_uri,
      direction = 'both',
      relation_type,
      entity_type,
      limit = 50,
      offset = 0
    } = req.query

    if (!base_uri) {
      return res.status(400).send({ error: 'base_uri is required' })
    }

    // Create permission context for filtering results
    const permission_context = new PermissionContext({ user_public_key })

    const limit_num = parseInt(limit, 10) || 50
    const offset_num = parseInt(offset, 10) || 0

    let forward_relations = []
    let reverse_relations = []

    // Fetch forward relations (this entity -> targets)
    if (direction === 'forward' || direction === 'both') {
      const raw_forward = await find_related_entities({
        base_uri,
        relation_type: relation_type || null,
        entity_type: entity_type || null,
        limit: limit_num,
        offset: offset_num
      })

      // Apply permission-based redaction
      forward_relations = await redact_relations_by_permission({
        relations: raw_forward,
        permission_context
      })
    }

    // Fetch reverse relations (sources -> this entity)
    if (direction === 'reverse' || direction === 'both') {
      const raw_reverse = await find_entities_relating_to({
        base_uri,
        relation_type: relation_type || null,
        entity_type: entity_type || null,
        limit: limit_num,
        offset: offset_num
      })

      // Apply permission-based redaction
      reverse_relations = await redact_relations_by_permission({
        relations: raw_reverse,
        permission_context
      })
    }

    log(
      'Relations query for %s: %d forward, %d reverse (with permission-based redaction)',
      base_uri,
      forward_relations.length,
      reverse_relations.length
    )

    res.send({
      forward: forward_relations,
      reverse: reverse_relations,
      counts: {
        forward: forward_relations.length,
        reverse: reverse_relations.length
      }
    })
  } catch (error) {
    log('Error querying relations: %s', error.message)
    res.status(500).send({ error: error.message })
  }
})

export default router
