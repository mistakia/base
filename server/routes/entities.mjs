/**
 * Entity Relations API Routes
 *
 * Provides unified relations query endpoint for entities.
 */

import express from 'express'
import debug from 'debug'

import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { get_kuzu_connection } from '#libs-server/embedded-database-index/kuzu/kuzu-database-client.mjs'
import {
  find_related_entities,
  find_entities_relating_to
} from '#libs-server/embedded-database-index/kuzu/kuzu-graph-queries.mjs'
import { PermissionContext } from '#server/middleware/permission/permission-context.mjs'
import {
  redact_base_uri,
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

    // Check if Kuzu is available
    if (!embedded_index_manager.is_kuzu_ready()) {
      return res.status(503).send({ error: 'Graph database not available' })
    }

    // Create permission context for filtering results
    const permission_context = new PermissionContext({ user_public_key })

    const kuzu_connection = await get_kuzu_connection()
    const limit_num = parseInt(limit, 10) || 50
    const offset_num = parseInt(offset, 10) || 0

    let forward_relations = []
    let reverse_relations = []

    // Fetch forward relations (this entity -> targets)
    if (direction === 'forward' || direction === 'both') {
      const raw_forward = await find_related_entities({
        connection: kuzu_connection,
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
        connection: kuzu_connection,
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
