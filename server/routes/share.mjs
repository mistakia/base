import debug from 'debug'
import express from 'express'
import ed25519 from '@trashman/ed25519-blake2b'

import config from '#config'
import { parse_share_token } from '#libs-server/share-token/verify-share-token.mjs'
import { create_share_token } from '#libs-server/share-token/create-share-token.mjs'
import {
  PAYLOAD_LENGTH,
  TOKEN_TOTAL_LENGTH,
  OFFSET_PUBLIC_KEY
} from '#libs-server/share-token/index.mjs'
import {
  get_entity_by_id,
  query_threads_from_duckdb
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'

const log = debug('api:share')
const router = express.Router({ mergeParams: true })

/**
 * POST /
 *
 * Generate a share token for an entity. Requires authentication.
 * The server signs the token using the configured private key.
 *
 * Body: { entity_id: string, exp?: number }
 *   exp: expiration as epoch seconds (0 or omitted = no expiry)
 */
router.post('/', async (req, res) => {
  try {
    const user_public_key = req.user?.user_public_key
    if (!user_public_key) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    if (!config.user_private_key) {
      log('Share token generation unavailable: user_private_key not configured')
      return res.status(503).json({ error: 'Share token generation not configured' })
    }

    const { entity_id, exp = 0 } = req.body
    if (!entity_id || typeof entity_id !== 'string') {
      return res.status(400).json({ error: 'entity_id is required' })
    }

    // Validate entity exists
    const entity = await get_entity_by_id({ entity_id })
    let resource_type = 'entity'
    if (!entity) {
      const thread_results = await query_threads_from_duckdb({
        filters: [{ column_id: 'thread_id', operator: 'eq', value: entity_id }],
        limit: 1
      })
      if (thread_results.length === 0) {
        return res.status(404).json({ error: 'Entity or thread not found' })
      }
      resource_type = 'thread'
    }

    const token = create_share_token({
      entity_id,
      private_key: config.user_private_key,
      public_key: user_public_key,
      exp
    })

    const base_url = config.public_url || `http://localhost:${config.server_port}`
    const share_url = `${base_url}/s/${token}`

    log('Generated share token for %s %s (exp=%d)', resource_type, entity_id, exp)
    return res.json({
      share_url,
      token,
      entity_id,
      resource_type,
      expires_at: exp || null
    })
  } catch (error) {
    log('Error generating share token: %s', error.message)
    return res.status(500).json({ error: 'Failed to generate share token' })
  }
})

/**
 * GET /:token
 *
 * Resolve a share token to the appropriate client page URL and redirect
 * with the token appended as a query parameter.
 *
 * Verifies the token signature before performing any database lookup
 * to prevent entity existence enumeration.
 */
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params
    const parsed = parse_share_token(token)

    if (!parsed.valid) {
      log('Invalid share token structure: %s', parsed.reason)
      return res.status(404).json({ error: 'Invalid share link' })
    }

    // Verify signature before any DB lookup to prevent entity existence oracle
    const { buf, entity_id } = parsed
    const payload = buf.subarray(0, PAYLOAD_LENGTH)
    const signature = buf.subarray(PAYLOAD_LENGTH, TOKEN_TOTAL_LENGTH)
    const pk_bytes = buf.subarray(OFFSET_PUBLIC_KEY, OFFSET_PUBLIC_KEY + 32)
    const payload_hash = ed25519.hash(payload)

    if (!ed25519.verify(signature, payload_hash, pk_bytes)) {
      log('Invalid signature on share token')
      return res.status(404).json({ error: 'Invalid share link' })
    }

    // Try entity lookup first
    const entity = await get_entity_by_id({ entity_id })
    if (entity) {
      const client_path = base_uri_to_client_path(entity.base_uri)
      if (!client_path) {
        return res.status(404).json({ error: 'Shared resource not found' })
      }
      return res.redirect(`${client_path}?share_token=${token}`)
    }

    // Try thread lookup (threads use thread_id, not entity_id)
    const thread_results = await query_threads_from_duckdb({
      filters: [{ column_id: 'thread_id', operator: 'eq', value: entity_id }],
      limit: 1
    })
    if (thread_results.length > 0) {
      return res.redirect(`/thread/${entity_id}?share_token=${token}`)
    }

    log('No entity or thread found for entity_id: %s', entity_id)
    return res.status(404).json({ error: 'Shared resource not found' })
  } catch (error) {
    log('Error resolving share link: %s', error.message)
    return res.status(500).json({ error: 'Failed to resolve share link' })
  }
})

/**
 * Convert a base_uri to a client-side path for redirect.
 * Returns null if the path is unsafe (e.g., protocol-relative).
 */
function base_uri_to_client_path(base_uri) {
  let path
  if (base_uri.startsWith('user:')) {
    path = `/${base_uri.slice(5)}`
  } else if (base_uri.startsWith('sys:')) {
    path = `/repository/active/base/${base_uri.slice(4)}`
  } else {
    path = `/${base_uri}`
  }

  // Prevent open redirect via protocol-relative URLs
  if (path.startsWith('//')) {
    log('Blocked unsafe redirect path: %s', path)
    return null
  }

  return path
}

export default router
