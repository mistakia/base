/**
 * Entity API Routes
 *
 * Provides unified entity query and relations endpoints.
 */

import express from 'express'
import debug from 'debug'

import { parse_array_param } from '#server/utils/query-params.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import {
  add_tags_to_entity,
  remove_tags_from_entity
} from '#libs-server/tag/filesystem/manage-entity-tags.mjs'
import { sync_thread_tags_to_sqlite } from '#libs-server/embedded-database-index/sqlite/sqlite-entity-sync.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { check_permission } from '#server/middleware/permission/index.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { PermissionContext } from '#server/middleware/permission/permission-context.mjs'
import {
  redact_base_uri,
  DEFAULT_REDACTED_STRING
} from '#server/middleware/content-redactor.mjs'
import {
  filter_entities_by_permission,
  filter_threads_by_permission
} from '#server/middleware/permission/redact-entity-references.mjs'

const log = debug('api:entities')
const router = express.Router({ mergeParams: true })

/**
 * Apply permission-based redaction to relations array (structured objects from DuckDB).
 * Returns all relations, but redacts those the user cannot access.
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

    // Single entity lookup mode
    if (base_uri || entity_id) {
      let entity = null

      if (base_uri) {
        entity = await embedded_index_manager.get_entity_by_uri({ base_uri })
      } else if (entity_id) {
        entity = await embedded_index_manager.get_entity_by_id({ entity_id })
      }

      if (!entity) {
        return res.send({ entities: [], total: 0, limit, offset })
      }

      // Apply permission-based redaction (entity + tag/relation references)
      const [filtered_entity] = await filter_entities_by_permission({
        entities: [entity],
        user_public_key
      })

      return res.send({ entities: [filtered_entity], total: 1, limit, offset })
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

    if (tags.length > 0 && !without_tags_filter) {
      filters.push({ column_id: 'tags', operator: 'IN', value: tags })
    }

    if (without_tags_filter) {
      filters.push({ column_id: 'tags', operator: 'IS_EMPTY' })
    }

    const sort_config = [{ column_id: sort, desc: sort_descending }]

    // Query entities and count
    // search is passed as a dedicated parameter to search across title and description
    const [entities, total] = await Promise.all([
      embedded_index_manager.query_entities({
        filters,
        sort: sort_config,
        limit,
        offset,
        search
      }),
      embedded_index_manager.count_entities({ filters, search })
    ])

    // Apply permission-based filtering and tag/relation redaction
    const filtered_entities = await filter_entities_by_permission({
      entities,
      user_public_key
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
    if (error.message?.startsWith('Index not available')) {
      return res.status(503).send({ error: 'Database not available' })
    }
    res.status(500).send({ error: error.message })
  }
})

/**
 * GET /api/entities/threads
 *
 * Get threads that have worked on or referenced an entity.
 * Results are sorted by updated_at descending.
 *
 * Query params:
 * - base_uri (required): Entity base URI to find threads for
 * - relation_type: Filter by relation type (modifies, accesses, creates, relates_to)
 * - limit: Max results (default: 50)
 * - offset: Pagination offset
 */
router.get('/threads', async (req, res) => {
  try {
    const user_public_key = req.user?.user_public_key || null
    const { base_uri, relation_type, limit = 50, offset = 0 } = req.query

    if (!base_uri) {
      return res.status(400).send({ error: 'base_uri is required' })
    }

    const limit_num = Math.min(parseInt(limit, 10) || 50, 1000)
    const offset_num = parseInt(offset, 10) || 0

    const threads = await embedded_index_manager.find_threads_relating_to({
      base_uri,
      relation_type: relation_type || null,
      limit: limit_num,
      offset: offset_num
    })

    // Apply permission-based filtering and redaction
    const filtered_threads = await filter_threads_by_permission({
      threads,
      user_public_key
    })

    log(
      'Entity threads query for %s: %d threads found (with permission filtering)',
      base_uri,
      filtered_threads.length
    )

    res.send({
      threads: filtered_threads,
      total: filtered_threads.length,
      limit: limit_num,
      offset: offset_num
    })
  } catch (error) {
    log('Error querying entity threads: %s', error.message)
    if (error.message?.startsWith('Index not available')) {
      return res.status(503).send({ error: 'Database not available' })
    }
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
      const raw_forward = await embedded_index_manager.find_related_entities({
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
      const raw_reverse = await embedded_index_manager.find_entities_relating_to({
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
    if (error.message?.startsWith('Index not available')) {
      return res.status(503).send({ error: 'Database not available' })
    }
    res.status(500).send({ error: error.message })
  }
})

/**
 * POST /api/entities/tags
 *
 * Add or remove tags from any entity.
 *
 * Body:
 * - base_uri (required): Entity base URI
 * - tags_to_add: Array of tag base URIs to add
 * - tags_to_remove: Array of tag base URIs to remove
 */
router.post('/tags', async (req, res) => {
  try {
    const user_public_key = req.user?.user_public_key
    if (!user_public_key) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { base_uri, tags_to_add, tags_to_remove } = req.body

    if (!base_uri) {
      return res.status(400).json({ error: 'base_uri is required' })
    }

    const has_adds = Array.isArray(tags_to_add) && tags_to_add.length > 0
    const has_removes =
      Array.isArray(tags_to_remove) && tags_to_remove.length > 0

    if (!has_adds && !has_removes) {
      return res
        .status(400)
        .json({ error: 'tags_to_add or tags_to_remove is required' })
    }

    // Check write permission
    const permission_result = await check_permission({
      user_public_key,
      resource_path: base_uri
    })

    if (!permission_result.write.allowed) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    // Resolve base_uri to absolute path
    const absolute_path = resolve_base_uri(base_uri)

    const result = { success: true }
    let last_tag_result = null

    if (has_adds) {
      const add_result = await add_tags_to_entity({
        absolute_path,
        tags_to_add
      })
      if (!add_result.success) {
        return res.status(500).json({ error: add_result.error })
      }
      result.added_tags = add_result.added_tags
      result.total_tags = add_result.total_tags
      last_tag_result = add_result
    }

    if (has_removes) {
      const remove_result = await remove_tags_from_entity({
        absolute_path,
        tags_to_remove
      })
      if (!remove_result.success) {
        // Sync thread tags from the add result before returning error
        if (last_tag_result && last_tag_result.thread_id) {
          await sync_thread_tags_to_sqlite({
            thread_id: last_tag_result.thread_id,
            tag_base_uris: last_tag_result.updated_tags
          })
        }
        return res.status(500).json({ error: remove_result.error })
      }
      result.removed_tags = remove_result.removed_tags
      result.total_tags = remove_result.total_tags
      last_tag_result = remove_result
    }

    // Sync thread tags to SQLite when operating on a thread entity
    if (last_tag_result && last_tag_result.thread_id) {
      await sync_thread_tags_to_sqlite({
        thread_id: last_tag_result.thread_id,
        tag_base_uris: last_tag_result.updated_tags
      })
    }

    log(
      'Entity tags updated for %s: added=%o removed=%o',
      base_uri,
      result.added_tags,
      result.removed_tags
    )

    res.status(200).json(result)
  } catch (error) {
    log('Error managing entity tags: %s', error.message)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PATCH /api/entities
 *
 * Update arbitrary frontmatter properties on any entity.
 *
 * Body:
 * - base_uri (required): Entity base URI
 * - properties (required): Object of property key/value pairs to merge
 */
router.patch('/', async (req, res) => {
  try {
    const user_public_key = req.user?.user_public_key
    if (!user_public_key) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { base_uri, properties } = req.body

    if (!base_uri) {
      return res.status(400).json({ error: 'base_uri is required' })
    }

    if (!properties || typeof properties !== 'object') {
      return res.status(400).json({ error: 'properties object is required' })
    }

    const immutable_fields = [
      'entity_id',
      'type',
      'user_public_key',
      'created_at',
      'base_uri'
    ]

    const rejected_fields = Object.keys(properties).filter((key) =>
      immutable_fields.includes(key)
    )
    if (rejected_fields.length > 0) {
      return res.status(400).json({
        error: `Cannot update immutable fields: ${rejected_fields.join(', ')}`
      })
    }

    // Check write permission
    const permission_result = await check_permission({
      user_public_key,
      resource_path: base_uri
    })

    if (!permission_result.write.allowed) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    // Resolve base_uri to absolute path and read entity
    const absolute_path = resolve_base_uri(base_uri)
    const entity = await read_entity_from_filesystem({ absolute_path })

    if (!entity.success) {
      return res.status(404).json({ error: entity.error })
    }

    // Coerce string values to native types where appropriate
    const coerced_properties = {}
    for (const [key, value] of Object.entries(properties)) {
      if (typeof value === 'string') {
        if (value === 'true') {
          coerced_properties[key] = true
        } else if (value === 'false') {
          coerced_properties[key] = false
        } else if (value !== '' && !isNaN(value) && !isNaN(parseFloat(value))) {
          coerced_properties[key] = parseFloat(value)
        } else {
          coerced_properties[key] = value
        }
      } else {
        coerced_properties[key] = value
      }
    }

    // Merge properties and set updated_at
    const updated_properties = {
      ...entity.entity_properties,
      ...coerced_properties,
      updated_at: new Date().toISOString()
    }

    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: updated_properties,
      entity_type: updated_properties.type,
      entity_content: entity.entity_content
    })

    const updated_keys = Object.keys(properties)

    log('Entity updated for %s: properties=%o', base_uri, updated_keys)

    res.status(200).json({
      success: true,
      base_uri,
      updated_properties: updated_keys
    })
  } catch (error) {
    log('Error updating entity: %s', error.message)
    res.status(500).json({ error: error.message })
  }
})

export default router
