import Ed25519 from 'nanocurrency-web/dist/lib/ed25519'
import Convert from 'nanocurrency-web/dist/lib/util/convert'
import { blake2b } from 'blakejs'

const TOKEN_VERSION = 0x01
const PAYLOAD_LENGTH = 53

/**
 * Create a share token client-side using Ed25519-Blake2b signing.
 *
 * Binary format (117 bytes):
 *   version (1B) + entity_id (16B) + public_key (32B) + exp (4B) + signature (64B)
 *
 * @param {Object} params
 * @param {string} params.entity_id - UUID of the entity to share
 * @param {string} params.private_key_hex - Issuer's Ed25519 private key as hex
 * @param {string} params.public_key_hex - Issuer's Ed25519 public key as hex
 * @param {number} params.exp - Expiration as uint32 epoch seconds; 0 = no expiry
 * @returns {string} Base64url-encoded token
 */
export function create_share_token({
  entity_id,
  private_key_hex,
  public_key_hex,
  exp = 0
}) {
  const entity_id_bytes = uuid_to_bytes(entity_id)
  const pk_bytes = hex_to_uint8(public_key_hex, 32)

  // Build 53-byte payload
  const payload = new Uint8Array(PAYLOAD_LENGTH)
  payload[0] = TOKEN_VERSION
  payload.set(entity_id_bytes, 1)
  payload.set(pk_bytes, 17)
  // Write exp as uint32 big-endian at offset 49
  payload[49] = (exp >>> 24) & 0xff
  payload[50] = (exp >>> 16) & 0xff
  payload[51] = (exp >>> 8) & 0xff
  payload[52] = exp & 0xff

  // Hash payload with Blake2b (32 bytes) and sign
  const payload_hash = blake2b(payload, null, 32)
  const signature = new Ed25519().sign(
    payload_hash,
    Convert.hex2ab(private_key_hex)
  )

  // Concatenate payload + signature (117 bytes total)
  const token_bytes = new Uint8Array(PAYLOAD_LENGTH + 64)
  token_bytes.set(payload, 0)
  token_bytes.set(new Uint8Array(signature), PAYLOAD_LENGTH)

  return uint8_to_base64url(token_bytes)
}

function uuid_to_bytes(uuid) {
  const hex = uuid.replace(/-/g, '')
  if (hex.length !== 32) {
    throw new Error('Invalid entity_id: must be a valid UUID')
  }
  return hex_to_uint8(hex, 16)
}

function hex_to_uint8(hex, expected_length) {
  const bytes = new Uint8Array(expected_length)
  for (let i = 0; i < expected_length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

function uint8_to_base64url(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
