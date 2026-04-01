import debug from 'debug'
import ed25519 from '#libs-server/crypto/ed25519-blake2b.mjs'

import { PermissionContext } from '#server/middleware/permission/permission-context.mjs'
import { parse_share_token } from '#libs-server/share-token/verify-share-token.mjs'
import {
  PAYLOAD_LENGTH,
  TOKEN_TOTAL_LENGTH,
  OFFSET_PUBLIC_KEY
} from '#libs-server/share-token/index.mjs'

const log = debug('share-token:verify')

/**
 * Verify a share token including signature and issuer access
 *
 * @param {Object} params
 * @param {string} params.token - Base64url-encoded token string
 * @param {string} params.resource_entity_id - Entity ID of the resource being accessed
 * @param {string} params.resource_path - Base-URI path of the resource (for issuer permission check)
 * @param {Object|null} params.resource_metadata - Optional pre-loaded resource metadata to avoid re-reading
 * @returns {Promise<{ valid: boolean, entity_id?: string, issuer_public_key?: string, expires_at?: number, reason?: string }>}
 */
export async function verify_share_token({
  token,
  resource_entity_id,
  resource_path,
  resource_metadata = null
}) {
  const parsed = parse_share_token(token)
  if (!parsed.valid) {
    log('Token parse failed: %s', parsed.reason)
    return parsed
  }

  const { buf, entity_id, issuer_public_key, expires_at } = parsed

  // Check expiration
  if (expires_at > 0 && Math.floor(Date.now() / 1000) > expires_at) {
    log('Token expired for entity %s', entity_id)
    return {
      valid: false,
      entity_id,
      issuer_public_key,
      expires_at,
      reason: 'expired'
    }
  }

  // Verify signature
  const payload = buf.subarray(0, PAYLOAD_LENGTH)
  const signature = buf.subarray(PAYLOAD_LENGTH, TOKEN_TOTAL_LENGTH)
  const pk_bytes = buf.subarray(OFFSET_PUBLIC_KEY, OFFSET_PUBLIC_KEY + 32)

  const payload_hash = ed25519.hash(payload)
  const signature_valid = ed25519.verify(signature, payload_hash, pk_bytes)

  if (!signature_valid) {
    log('Invalid signature for entity %s', entity_id)
    return {
      valid: false,
      entity_id,
      issuer_public_key,
      expires_at,
      reason: 'invalid_signature'
    }
  }

  // Check entity_id matches the requested resource
  if (entity_id !== resource_entity_id) {
    log('Entity mismatch: token=%s, resource=%s', entity_id, resource_entity_id)
    return {
      valid: false,
      entity_id,
      issuer_public_key,
      expires_at,
      reason: 'entity_mismatch'
    }
  }

  // Check issuer still has read access to the resource
  // Intentionally omit share_token to prevent recursive verification
  const issuer_context = new PermissionContext({
    user_public_key: issuer_public_key
  })
  const issuer_permission = await issuer_context.check_permission({
    resource_path,
    metadata: resource_metadata
  })

  if (!issuer_permission.read.allowed) {
    log(
      'Issuer %s no longer has read access to entity %s',
      issuer_public_key,
      entity_id
    )
    return {
      valid: false,
      entity_id,
      issuer_public_key,
      expires_at,
      reason: 'issuer_access_revoked'
    }
  }

  log('Token verified for entity %s (issuer=%s)', entity_id, issuer_public_key)
  return { valid: true, entity_id, issuer_public_key, expires_at }
}
