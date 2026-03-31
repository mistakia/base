/**
 * @fileoverview Integration tests for share token permission flow
 *
 * Tests end-to-end share token flow: token generation, /s/:token redirect,
 * and permission pipeline integration.
 */

/* global describe it before after */
import chai from 'chai'
import chaiHttp from 'chai-http'
import crypto from 'crypto'
import ed25519 from '@trashman/ed25519-blake2b'

import server from '#server'
import { create_test_user, create_auth_token } from '#tests/utils/index.mjs'
import reset_all_tables from '#tests/utils/reset-all-tables.mjs'
import {
  initialize_duckdb_client,
  close_duckdb_connection
} from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'
import { create_duckdb_schema } from '#libs-server/embedded-database-index/duckdb/duckdb-schema-definitions.mjs'
import { upsert_entity_to_duckdb } from '#libs-server/embedded-database-index/duckdb/duckdb-entity-sync.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

import { create_share_token } from '#libs-server/share-token/create-share-token.mjs'
import { parse_share_token } from '#libs-server/share-token/verify-share-token.mjs'

const { expect } = chai
chai.use(chaiHttp)

describe('Share Token Integration', () => {
  let owner
  const entity_id = '550e8400-e29b-41d4-a716-446655440000'
  const base_uri = 'user:task/shared-task.md'

  before(async () => {
    await reset_all_tables()
    owner = await create_test_user()
    owner.jwt_token = create_auth_token(owner)

    await close_duckdb_connection()
    await initialize_duckdb_client({ in_memory: true })
    await create_duckdb_schema()
    embedded_index_manager.duckdb_ready = true
    embedded_index_manager.initialized = true

    await upsert_entity_to_duckdb({
      entity_data: {
        entity_id,
        base_uri,
        type: 'task',
        frontmatter: {
          entity_id,
          base_uri,
          type: 'task',
          title: 'Shared Task',
          description: 'A task for share token testing',
          status: 'In Progress',
          public_read: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          user_public_key: owner.user_public_key
        },
        user_public_key: owner.user_public_key
      }
    })
  })

  after(async () => {
    await close_duckdb_connection()
    embedded_index_manager.duckdb_ready = false
  })

  describe('GET /s/:token (share route redirect)', () => {
    it('should redirect to entity page with share_token query parameter', async () => {
      const token = create_share_token({
        entity_id,
        private_key: owner.user_private_key,
        public_key: owner.user_public_key
      })

      const res = await chai.request(server).get(`/s/${token}`).redirects(0)

      expect(res).to.have.status(302)
      expect(res.headers.location).to.include('/task/shared-task.md')
      expect(res.headers.location).to.include(`share_token=${token}`)
    })

    it('should return 404 for invalid token structure', async () => {
      const res = await chai.request(server).get('/s/invalid-token')

      expect(res).to.have.status(404)
      expect(res.body).to.have.property('error')
    })

    it('should return 404 for token with invalid signature', async () => {
      const token = create_share_token({
        entity_id,
        private_key: owner.user_private_key,
        public_key: owner.user_public_key
      })

      // Tamper with the signature portion (last 64 bytes)
      const buf = Buffer.from(token, 'base64url')
      buf[buf.length - 1] ^= 0xff
      const tampered = buf.toString('base64url')

      const res = await chai.request(server).get(`/s/${tampered}`)

      expect(res).to.have.status(404)
    })

    it('should return 404 for token referencing non-existent entity', async () => {
      const non_existent_id = '00000000-0000-0000-0000-000000000000'
      const token = create_share_token({
        entity_id: non_existent_id,
        private_key: owner.user_private_key,
        public_key: owner.user_public_key
      })

      const res = await chai.request(server).get(`/s/${token}`)

      expect(res).to.have.status(404)
    })
  })

  describe('token creation and parsing roundtrip', () => {
    it('should create and parse a token with correct fields', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600
      const token = create_share_token({
        entity_id,
        private_key: owner.user_private_key,
        public_key: owner.user_public_key,
        exp
      })

      const parsed = parse_share_token(token)
      expect(parsed.valid).to.be.true
      expect(parsed.entity_id).to.equal(entity_id)
      expect(parsed.issuer_public_key).to.equal(owner.user_public_key)
      expect(parsed.expires_at).to.equal(exp)
    })

    it('should reject expired token during parse (expiration is checked at verify)', () => {
      const expired = Math.floor(Date.now() / 1000) - 3600
      const token = create_share_token({
        entity_id,
        private_key: owner.user_private_key,
        public_key: owner.user_public_key,
        exp: expired
      })

      // parse_share_token does not check expiration (only verify does)
      const parsed = parse_share_token(token)
      expect(parsed.valid).to.be.true
      expect(parsed.expires_at).to.equal(expired)
    })
  })

  describe('token does not grant write access', () => {
    it('should only allow read via share token, never write', async () => {
      const token = create_share_token({
        entity_id,
        private_key: owner.user_private_key,
        public_key: owner.user_public_key
      })

      // Attempt a write operation with share_token (no auth)
      const res = await chai
        .request(server)
        .post('/api/entities/tags')
        .query({ share_token: token })
        .send({ base_uri, tags_to_add: ['user:tag/test.md'] })

      // Should be denied (403 or 401) since share tokens only grant read
      expect(res.status).to.be.oneOf([401, 403])
    })
  })

  describe('token signed by different user', () => {
    it('should create tokens with different issuer keys', () => {
      const other_private_key = crypto.randomBytes(32)
      const other_public_key = ed25519.publicKey(other_private_key)

      const token = create_share_token({
        entity_id,
        private_key: other_private_key,
        public_key: other_public_key
      })

      const parsed = parse_share_token(token)
      expect(parsed.valid).to.be.true
      expect(parsed.issuer_public_key).to.equal(
        other_public_key.toString('hex')
      )
      expect(parsed.issuer_public_key).to.not.equal(owner.user_public_key)
    })
  })
})
