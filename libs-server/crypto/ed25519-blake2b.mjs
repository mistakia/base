/**
 * Pure-JS Ed25519-Blake2b
 *
 * Drop-in replacement for @trashman/ed25519-blake2b native module.
 * Uses nanocurrency-web's Ed25519 class (blake2b-based, Nano protocol compatible)
 * and blakejs for hashing. Both are existing dependencies.
 *
 * API matches the native module:
 *   publicKey(secretKey) -> Buffer (32 bytes)
 *   sign(message, secretKey, publicKey) -> Buffer (64 bytes)
 *   verify(signature, message, publicKey) -> boolean
 *   hash(message, length?) -> Buffer (default 32 bytes)
 */

import { blake2b } from 'blakejs'

// nanocurrency-web's Ed25519 class uses blake2b internally for ed25519
// operations (matching the Nano protocol and ed25519-donna-blake2b).
// We import the class directly rather than using the Signer wrapper,
// which auto-hashes data before signing.
import Ed25519Impl from 'nanocurrency-web/dist/lib/ed25519.js'

const Ed25519Class = Ed25519Impl.default || Ed25519Impl
const ed = new Ed25519Class()

function to_buffer(input) {
  if (Buffer.isBuffer(input)) return input
  if (typeof input === 'string') return Buffer.from(input, 'hex')
  if (input instanceof Uint8Array) return Buffer.from(input)
  throw new Error('Input must be a Buffer, hex string, or Uint8Array')
}

/**
 * Derive Ed25519 public key from a 32-byte secret key (seed).
 * @param {Buffer|string} secretKey - 32-byte seed (Buffer or hex string)
 * @returns {Buffer} 32-byte public key
 */
export function publicKey(secretKey) {
  const sk = to_buffer(secretKey)
  const keys = ed.generateKeys(sk.toString('hex'))
  return Buffer.from(keys.publicKey, 'hex')
}

/**
 * Sign a message with Ed25519-Blake2b.
 * @param {Buffer|string} message - Message bytes to sign (typically pre-hashed)
 * @param {Buffer|string} secretKey - 32-byte secret key
 * @param {Buffer|string} _publicKey - 32-byte public key (unused, kept for API compat)
 * @returns {Buffer} 64-byte signature
 */
export function sign(message, secretKey, _publicKey) {
  const msg = to_buffer(message)
  const sk = to_buffer(secretKey)
  const sig = ed.sign(new Uint8Array(msg), new Uint8Array(sk))
  return Buffer.from(sig)
}

/**
 * Verify an Ed25519-Blake2b signature.
 * @param {Buffer|string} signature - 64-byte signature
 * @param {Buffer|string} message - Original message bytes
 * @param {Buffer|string} pubKey - 32-byte public key
 * @returns {boolean} True if signature is valid
 */
export function verify(signature, message, pubKey) {
  const sig = to_buffer(signature)
  const msg = to_buffer(message)
  const pk = to_buffer(pubKey)
  return ed.verify(new Uint8Array(msg), new Uint8Array(pk), new Uint8Array(sig))
}

/**
 * Blake2b hash.
 * @param {Buffer|string} message - Data to hash
 * @param {number} [length=32] - Output length in bytes
 * @returns {Buffer} Hash output
 */
export function hash(message, length = 32) {
  const msg = to_buffer(message)
  const output = blake2b(msg, null, length)
  return Buffer.from(output)
}

export default { publicKey, sign, verify, hash }
