import { expect } from 'chai'
import crypto from 'crypto'
import ed25519 from '@trashman/ed25519-blake2b'

import { create_share_token } from '#libs-server/share-token/create-share-token.mjs'
import {
  parse_share_token
} from '#libs-server/share-token/verify-share-token.mjs'
import {
  TOKEN_VERSION,
  PAYLOAD_LENGTH,
  TOKEN_TOTAL_LENGTH
} from '#libs-server/share-token/index.mjs'

describe('Share Token', function () {
  const private_key = crypto.randomBytes(32)
  const public_key = ed25519.publicKey(private_key)
  const public_key_hex = public_key.toString('hex')
  const private_key_hex = private_key.toString('hex')
  const entity_id = 'e5752f21-b2b2-45da-b63b-60889192a5f6'

  describe('create_share_token', () => {
    it('should create a valid base64url-encoded token', () => {
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex
      })

      expect(token).to.be.a('string')
      // base64url should not contain +, /, or =
      expect(token).to.not.match(/[+/=]/)

      const buf = Buffer.from(token, 'base64url')
      expect(buf.length).to.equal(TOKEN_TOTAL_LENGTH)
    })

    it('should set version byte to TOKEN_VERSION', () => {
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex
      })

      const buf = Buffer.from(token, 'base64url')
      expect(buf.readUInt8(0)).to.equal(TOKEN_VERSION)
    })

    it('should embed entity_id as 16-byte binary UUID', () => {
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex
      })

      const buf = Buffer.from(token, 'base64url')
      const embedded_hex = buf.subarray(1, 17).toString('hex')
      const expected_hex = entity_id.replace(/-/g, '')
      expect(embedded_hex).to.equal(expected_hex)
    })

    it('should embed public key at correct offset', () => {
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex
      })

      const buf = Buffer.from(token, 'base64url')
      const embedded_pk = buf.subarray(17, 49).toString('hex')
      expect(embedded_pk).to.equal(public_key_hex)
    })

    it('should default exp to 0 (no expiry)', () => {
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex
      })

      const buf = Buffer.from(token, 'base64url')
      const exp = buf.readUInt32BE(49)
      expect(exp).to.equal(0)
    })

    it('should encode custom expiration', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex,
        exp
      })

      const buf = Buffer.from(token, 'base64url')
      expect(buf.readUInt32BE(49)).to.equal(exp)
    })

    it('should produce tokens with identical payloads for same inputs', () => {
      const params = {
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex,
        exp: 1000000
      }
      const buf1 = Buffer.from(create_share_token(params), 'base64url')
      const buf2 = Buffer.from(create_share_token(params), 'base64url')
      // Payloads (first 53 bytes) should be identical
      expect(buf1.subarray(0, PAYLOAD_LENGTH).equals(buf2.subarray(0, PAYLOAD_LENGTH))).to.be.true
    })

    it('should accept Buffer keys', () => {
      const token = create_share_token({
        entity_id,
        private_key,
        public_key
      })

      expect(token).to.be.a('string')
      const buf = Buffer.from(token, 'base64url')
      expect(buf.length).to.equal(TOKEN_TOTAL_LENGTH)
    })

    it('should throw on invalid UUID', () => {
      expect(() =>
        create_share_token({
          entity_id: 'not-a-uuid',
          private_key: private_key_hex,
          public_key: public_key_hex
        })
      ).to.throw('Invalid entity_id')
    })

    it('should throw on wrong-length public key', () => {
      expect(() =>
        create_share_token({
          entity_id,
          private_key: private_key_hex,
          public_key: 'aabb'
        })
      ).to.throw('Invalid public_key')
    })
  })

  describe('parse_share_token', () => {
    it('should parse a valid token and extract fields', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex,
        exp
      })

      const parsed = parse_share_token(token)
      expect(parsed.valid).to.be.true
      expect(parsed.entity_id).to.equal(entity_id)
      expect(parsed.issuer_public_key).to.equal(public_key_hex)
      expect(parsed.expires_at).to.equal(exp)
    })

    it('should reject truncated token', () => {
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex
      })

      const parsed = parse_share_token(token.slice(0, 10))
      expect(parsed.valid).to.be.false
      expect(parsed.reason).to.equal('invalid_length')
    })

    it('should reject unsupported version', () => {
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex
      })

      // Modify version byte
      const buf = Buffer.from(token, 'base64url')
      buf.writeUInt8(0xFF, 0)
      const modified = buf.toString('base64url')

      const parsed = parse_share_token(modified)
      expect(parsed.valid).to.be.false
      expect(parsed.reason).to.equal('unsupported_version')
    })

    it('should handle completely malformed input', () => {
      const parsed = parse_share_token('not-valid-base64-token!!!')
      expect(parsed.valid).to.be.false
    })

    it('should handle empty string', () => {
      const parsed = parse_share_token('')
      expect(parsed.valid).to.be.false
    })
  })

  describe('signature verification', () => {
    it('should produce a valid Ed25519-Blake2b signature', () => {
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex
      })

      const buf = Buffer.from(token, 'base64url')
      const payload = buf.subarray(0, PAYLOAD_LENGTH)
      const signature = buf.subarray(PAYLOAD_LENGTH, TOKEN_TOTAL_LENGTH)
      const pk = buf.subarray(17, 49)

      const payload_hash = ed25519.hash(payload)
      const is_valid = ed25519.verify(signature, payload_hash, pk)
      expect(is_valid).to.be.true
    })

    it('should fail verification with tampered payload', () => {
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex
      })

      const buf = Buffer.from(token, 'base64url')
      // Tamper with expiration byte
      buf.writeUInt32BE(999999, 49)

      const payload = buf.subarray(0, PAYLOAD_LENGTH)
      const signature = buf.subarray(PAYLOAD_LENGTH, TOKEN_TOTAL_LENGTH)
      const pk = buf.subarray(17, 49)

      const payload_hash = ed25519.hash(payload)
      const is_valid = ed25519.verify(signature, payload_hash, pk)
      expect(is_valid).to.be.false
    })

    it('should fail verification with wrong public key', () => {
      const token = create_share_token({
        entity_id,
        private_key: private_key_hex,
        public_key: public_key_hex
      })

      const buf = Buffer.from(token, 'base64url')
      const payload = buf.subarray(0, PAYLOAD_LENGTH)
      const signature = buf.subarray(PAYLOAD_LENGTH, TOKEN_TOTAL_LENGTH)

      const other_key = ed25519.publicKey(crypto.randomBytes(32))
      const payload_hash = ed25519.hash(payload)
      const is_valid = ed25519.verify(signature, payload_hash, other_key)
      expect(is_valid).to.be.false
    })
  })
})
