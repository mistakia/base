import debug from 'debug'
import ed25519 from '#libs-server/crypto/ed25519-blake2b.mjs'

import {
  TOKEN_VERSION,
  PAYLOAD_LENGTH,
  OFFSET_VERSION,
  OFFSET_ENTITY_ID,
  OFFSET_PUBLIC_KEY,
  OFFSET_EXPIRATION
} from './index.mjs'

const log = debug('share-token:create')

/**
 * Create a share token granting read access to an entity
 *
 * Binary format (117 bytes total):
 *   version (1B) + entity_id (16B) + public_key (32B) + exp (4B) + signature (64B)
 *
 * @param {Object} params
 * @param {string} params.entity_id - UUID of the entity to share
 * @param {Buffer|string} params.private_key - Issuer's Ed25519 private key (32 bytes or hex string)
 * @param {Buffer|string} params.public_key - Issuer's Ed25519 public key (32 bytes or hex string)
 * @param {number} params.exp - Expiration as uint32 epoch seconds; 0 = no expiry
 * @returns {string} Base64url-encoded token
 */
export function create_share_token({
  entity_id,
  private_key,
  public_key,
  exp = 0
}) {
  const entity_id_bytes = uuid_to_bytes(entity_id)
  const pk_bytes = to_buffer(public_key, 32, 'public_key')
  const sk_bytes = to_buffer(private_key, 32, 'private_key')

  const payload = Buffer.alloc(PAYLOAD_LENGTH)
  payload.writeUInt8(TOKEN_VERSION, OFFSET_VERSION)
  entity_id_bytes.copy(payload, OFFSET_ENTITY_ID)
  pk_bytes.copy(payload, OFFSET_PUBLIC_KEY)
  payload.writeUInt32BE(exp, OFFSET_EXPIRATION)

  const payload_hash = ed25519.hash(payload)
  const signature = ed25519.sign(payload_hash, sk_bytes, pk_bytes)

  const token_bytes = Buffer.concat([payload, signature])
  const token = token_bytes.toString('base64url')

  log('Created share token for entity %s (exp=%d)', entity_id, exp)
  return token
}

function uuid_to_bytes(uuid) {
  const hex = uuid.replace(/-/g, '')
  if (hex.length !== 32) {
    throw new Error('Invalid entity_id: must be a valid UUID')
  }
  return Buffer.from(hex, 'hex')
}

function to_buffer(value, expected_length, name) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value, 'hex')
  if (buf.length !== expected_length) {
    throw new Error(
      `Invalid ${name}: expected ${expected_length} bytes, got ${buf.length}`
    )
  }
  return buf
}
