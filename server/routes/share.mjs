import debug from 'debug'
import express from 'express'
import ed25519 from '#libs-server/crypto/ed25519-blake2b.mjs'

import { parse_share_token } from '#libs-server/share-token/verify-share-token.mjs'
import {
  PAYLOAD_LENGTH,
  TOKEN_TOTAL_LENGTH,
  OFFSET_PUBLIC_KEY
} from '#libs-server/share-token/index.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

const log = debug('api:share')
const router = express.Router({ mergeParams: true })

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
    const entity = await embedded_index_manager.get_entity_by_id({ entity_id })
    if (entity) {
      const client_path = base_uri_to_client_path(entity.base_uri)
      if (!client_path) {
        return res.status(404).json({ error: 'Shared resource not found' })
      }
      return res.redirect(`${client_path}?share_token=${token}`)
    }

    // Try thread lookup (threads use thread_id, not entity_id)
    const thread_results = await embedded_index_manager.query_threads({
      filters: [{ column_id: 'thread_id', operator: '=', value: entity_id }],
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
