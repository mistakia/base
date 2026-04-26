/* global describe it before after afterEach */
import os from 'os'
import { expect } from 'chai'
import IORedis from 'ioredis'
import crypto from 'crypto'

import { request } from '#tests/utils/test-request.mjs'
import server from '#server'
import config from '#config'
import { mint_service_token } from '#libs-server/threads/lease-auth.mjs'
import { _close_for_tests } from '#libs-server/threads/lease-store.mjs'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const STORAGE_MACHINE_ID = 'storage_test'
const REQUESTER_MACHINE_ID = 'macbook_test'

const _new_thread_id = () => `test-${crypto.randomBytes(8).toString('hex')}`

describe('API /api/threads (lease routes)', function () {
  this.timeout(10000)

  let cleanup_redis
  let original_registry
  const created_thread_ids = []

  before(async function () {
    cleanup_redis = new IORedis(REDIS_URL, { lazyConnect: false })
    try {
      await cleanup_redis.ping()
    } catch {
      this.skip()
    }
    original_registry = config.machine_registry
    config.machine_registry = {
      [REQUESTER_MACHINE_ID]: {
        hostname: 'macbook.unreachable.test',
        platform: 'darwin'
      },
      [STORAGE_MACHINE_ID]: {
        hostname: os.hostname(),
        platform: os.platform(),
        storage: { enabled: true }
      }
    }
  })

  afterEach(async () => {
    for (const thread_id of created_thread_ids.splice(0)) {
      await cleanup_redis.del(
        `lease:thread:${thread_id}`,
        `lease_token:thread:${thread_id}`
      )
    }
  })

  after(async () => {
    if (original_registry !== undefined) {
      config.machine_registry = original_registry
    }
    if (cleanup_redis) await cleanup_redis.quit()
    await _close_for_tests()
  })

  const _auth = (machine_id = STORAGE_MACHINE_ID) =>
    `Bearer ${mint_service_token({ machine_id })}`

  const _track = (id) => {
    created_thread_ids.push(id)
    return id
  }

  describe('require_service_auth', () => {
    it('returns 401 when Authorization header missing', async () => {
      const res = await request(server).get(`/api/threads/${_new_thread_id()}/lease`)
      expect(res.status).to.equal(401)
    })

    it('returns 401 with invalid token', async () => {
      const res = await request(server)
        .get(`/api/threads/${_new_thread_id()}/lease`)
        .set('Authorization', 'Bearer not-a-real-token')
      expect(res.status).to.equal(401)
    })
  })

  describe('non-storage gate', () => {
    it('returns 410 when current machine is not storage (with valid auth)', async () => {
      const original = config.machine_registry
      const token = mint_service_token({ machine_id: REQUESTER_MACHINE_ID })
      config.machine_registry = {
        [REQUESTER_MACHINE_ID]: {
          hostname: os.hostname(),
          platform: os.platform()
        },
        [STORAGE_MACHINE_ID]: {
          hostname: 'storage.unreachable.test',
          platform: 'linux',
          storage: { enabled: true }
        }
      }
      try {
        const res = await request(server)
          .get(`/api/threads/${_new_thread_id()}/lease`)
          .set('Authorization', `Bearer ${token}`)
        expect(res.status).to.equal(410)
      } finally {
        config.machine_registry = original
      }
    })
  })

  describe('acquire / inspect / renew / release', () => {
    it('acquires, inspects, renews, releases a lease', async () => {
      const thread_id = _track(_new_thread_id())

      const acquire_res = await request(server)
        .post(`/api/threads/${thread_id}/lease/acquire`)
        .set("Authorization", _auth())
        .send({
          machine_id: STORAGE_MACHINE_ID,
          ttl_ms: 5000,
          mode: 'session'
        })
      expect(acquire_res.status).to.equal(200)
      expect(acquire_res.body.acquired).to.equal(true)
      const lease_token = acquire_res.body.lease_token
      expect(lease_token).to.be.a('number')

      const inspect_res = await request(server)
        .get(`/api/threads/${thread_id}/lease`)
        .set("Authorization", _auth())
      expect(inspect_res.status).to.equal(200)
      expect(inspect_res.body.lease_token).to.equal(lease_token)

      const renew_res = await request(server)
        .post(`/api/threads/${thread_id}/lease/renew`)
        .set("Authorization", _auth())
        .send({ lease_token, ttl_ms: 6000 })
      expect(renew_res.status).to.equal(200)
      expect(renew_res.body.renewed).to.equal(true)

      const release_res = await request(server)
        .post(`/api/threads/${thread_id}/lease/release`)
        .set("Authorization", _auth())
        .send({ lease_token })
      expect(release_res.status).to.equal(200)
      expect(release_res.body.released).to.equal(true)
    })

    it('rejects acquire when machine_id mismatches token issuer', async () => {
      const thread_id = _track(_new_thread_id())
      const res = await request(server)
        .post(`/api/threads/${thread_id}/lease/acquire`)
        .set("Authorization", _auth(STORAGE_MACHINE_ID))
        .send({
          machine_id: REQUESTER_MACHINE_ID,
          ttl_ms: 5000
        })
      expect(res.status).to.equal(403)
    })

    it('rejects acquire missing required fields', async () => {
      const thread_id = _track(_new_thread_id())
      const res = await request(server)
        .post(`/api/threads/${thread_id}/lease/acquire`)
        .set("Authorization", _auth())
        .send({})
      expect(res.status).to.equal(400)
    })
  })

  describe('list with filter', () => {
    it('filters owned-by-me by requester machine_id', async () => {
      const t1 = _track(_new_thread_id())
      const t2 = _track(_new_thread_id())
      // Acquire one for storage_test, one for macbook_test (via lease-store directly through API auth)
      await request(server)
        .post(`/api/threads/${t1}/lease/acquire`)
        .set("Authorization", _auth(STORAGE_MACHINE_ID))
        .send({ machine_id: STORAGE_MACHINE_ID, ttl_ms: 5000 })
      await request(server)
        .post(`/api/threads/${t2}/lease/acquire`)
        .set("Authorization", _auth(REQUESTER_MACHINE_ID))
        .send({ machine_id: REQUESTER_MACHINE_ID, ttl_ms: 5000 })

      const me_res = await request(server)
        .get('/api/threads/lease?filter=owned-by-me')
        .set("Authorization", _auth(STORAGE_MACHINE_ID))
      expect(me_res.status).to.equal(200)
      const me_threads = me_res.body.leases.map((l) => l.thread_id)
      expect(me_threads).to.include(t1)
      expect(me_threads).to.not.include(t2)

      const remote_res = await request(server)
        .get('/api/threads/lease?filter=owned-by-remote')
        .set("Authorization", _auth(STORAGE_MACHINE_ID))
      const remote_threads = remote_res.body.leases.map((l) => l.thread_id)
      expect(remote_threads).to.include(t2)
      expect(remote_threads).to.not.include(t1)
    })

    it('rejects invalid filter', async () => {
      const res = await request(server)
        .get('/api/threads/lease?filter=bogus')
        .set("Authorization", _auth())
      expect(res.status).to.equal(400)
    })
  })
})
