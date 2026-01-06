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

const log = debug('api:entities')
const router = express.Router({ mergeParams: true })

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
    const user_public_key = req.user?.user_public_key
    if (!user_public_key) {
      return res.status(401).send({ error: 'authentication required' })
    }

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

    const kuzu_connection = await get_kuzu_connection()
    const limit_num = parseInt(limit, 10) || 50
    const offset_num = parseInt(offset, 10) || 0

    let forward_relations = []
    let reverse_relations = []

    // Fetch forward relations (this entity -> targets)
    if (direction === 'forward' || direction === 'both') {
      forward_relations = await find_related_entities({
        connection: kuzu_connection,
        base_uri,
        relation_type: relation_type || null,
        entity_type: entity_type || null,
        limit: limit_num,
        offset: offset_num
      })
    }

    // Fetch reverse relations (sources -> this entity)
    if (direction === 'reverse' || direction === 'both') {
      reverse_relations = await find_entities_relating_to({
        connection: kuzu_connection,
        base_uri,
        relation_type: relation_type || null,
        entity_type: entity_type || null,
        limit: limit_num,
        offset: offset_num
      })
    }

    log(
      'Relations query for %s: %d forward, %d reverse',
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
