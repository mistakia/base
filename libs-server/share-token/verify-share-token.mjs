import {
  TOKEN_VERSION,
  TOKEN_TOTAL_LENGTH,
  OFFSET_VERSION,
  OFFSET_ENTITY_ID,
  OFFSET_PUBLIC_KEY,
  OFFSET_EXPIRATION
} from './index.mjs'

/**
 * Parse a share token without full verification
 *
 * Decodes the token and extracts fields but does not verify the signature
 * or check issuer permissions. Useful for extracting entity_id for routing.
 *
 * @param {string} token - Base64url-encoded token string
 * @returns {{ valid: boolean, buf?: Buffer, entity_id?: string, issuer_public_key?: string, expires_at?: number, reason?: string }}
 */
export function parse_share_token(token) {
  try {
    const buf = Buffer.from(token, 'base64url')

    if (buf.length !== TOKEN_TOTAL_LENGTH) {
      return { valid: false, reason: 'invalid_length' }
    }

    const version = buf.readUInt8(OFFSET_VERSION)
    if (version !== TOKEN_VERSION) {
      return { valid: false, reason: 'unsupported_version' }
    }

    const entity_id = bytes_to_uuid(
      buf.subarray(OFFSET_ENTITY_ID, OFFSET_ENTITY_ID + 16)
    )
    const issuer_public_key = buf
      .subarray(OFFSET_PUBLIC_KEY, OFFSET_PUBLIC_KEY + 32)
      .toString('hex')
    const expires_at = buf.readUInt32BE(OFFSET_EXPIRATION)

    return { valid: true, buf, entity_id, issuer_public_key, expires_at }
  } catch {
    return { valid: false, reason: 'malformed_token' }
  }
}

function bytes_to_uuid(buf) {
  const hex = buf.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-')
}
