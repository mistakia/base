import os from 'os'
import { expect } from 'chai'
import IORedis from 'ioredis'
import crypto from 'crypto'

import { request } from '#tests/utils/test-request.mjs'
import server from '#server'
import config from '#config'
import { mint_service_token } from '#libs-server/threads/lease-auth.mjs'
import { _close_for_tests } from '#libs-server/threads/lease-store.mjs'
import { _clear_cache_for_tests } from '#libs-server/threads/lease-client.mjs'
import {
  create_test_user,
  authenticate_request,
  create_temp_test_repo
} from '#tests/utils/index.mjs'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

const _new_thread_id = () => `test-${crypto.randomBytes(8).toString('hex')}`

describe('API /api/threads/:id lease-aware routing', function () {
  this.timeout(15000)

  let cleanup_redis
  let original_registry
  let original_thread_config
  let test_user
  let test_directories
  const created_thread_ids = []

  before(async function () {
    cleanup_redis = new IORedis(REDIS_URL, { lazyConnect: false })
    try {
      await cleanup_redis.ping()
    } catch {
      this.skip()
    }

    original_registry = config.machine_registry
    original_thread_config = config.thread_config

    config.machine_registry = {
      local_machine: {
        hostname: os.hostname(),
        platform: os.platform(),
        storage: { enabled: true }
      },
      remote_machine: {
        hostname: 'remote.unreachable.test',
        platform: 'linux'
      },
      remote_with_url: {
        hostname: 'remote-url.unreachable.test',
        platform: 'linux',
        base_url: 'https://remote.example.com'
      }
    }
    config.thread_config = { ...(config.thread_config || {}), field_ownership_enforce: false }

    test_user = await create_test_user()
    const test_repo = await create_temp_test_repo({
      prefix: 'threads-routing-test-',
      register_directories: true
    })
    test_directories = test_repo
  })

  afterEach(async () => {
    for (const thread_id of created_thread_ids.splice(0)) {
      await cleanup_redis.del(
        `lease:thread:${thread_id}`,
        `lease_token:thread:${thread_id}`
      )
    }
    _clear_cache_for_tests()
  })

  after(async () => {
    if (original_registry !== undefined) config.machine_registry = original_registry
    if (original_thread_config !== undefined) config.thread_config = original_thread_config
    if (cleanup_redis) await cleanup_redis.quit()
    if (test_directories?.cleanup) test_directories.cleanup()
    await _close_for_tests()
  })

  const _auth = (machine_id = 'local_machine') =>
    `Bearer ${mint_service_token({ machine_id })}`

  const _track = (id) => {
    created_thread_ids.push(id)
    return id
  }

  const _acquire = async (thread_id, machine_id) => {
    return request(server)
      .post(`/api/threads/${thread_id}/lease/acquire`)
      .set('Authorization', _auth(machine_id))
      .send({ machine_id, ttl_ms: 30000, mode: 'session' })
  }

  describe('GET /:thread_id read routing', () => {
    it('no lease → X-Thread-Source: local (no redirect)', async () => {
      const thread_id = _track(_new_thread_id())
      const res = await request(server)
        .get(`/api/threads/${thread_id}`)
      expect(res.headers['x-thread-source']).to.equal('local')
      expect(res.status).to.not.equal(307)
    })

    it('lease held by current machine → X-Thread-Source: local, X-Thread-Owner set', async () => {
      const thread_id = _track(_new_thread_id())
      await _acquire(thread_id, 'local_machine')

      const res = await request(server)
        .get(`/api/threads/${thread_id}`)
      expect(res.status).to.not.equal(307)
      expect(res.headers['x-thread-owner']).to.equal('local_machine')
      expect(res.headers['x-thread-source']).to.equal('local')
    })

    it('lease held by remote machine with base_url → 307 with correct Location', async () => {
      const thread_id = _track(_new_thread_id())
      await _acquire(thread_id, 'remote_with_url')

      const res = await request(server)
        .get(`/api/threads/${thread_id}`)
        .redirects(0)
      expect(res.status).to.equal(307)
      expect(res.headers['location']).to.include('https://remote.example.com')
      expect(res.headers['location']).to.include(thread_id)
      expect(res.headers['x-thread-owner']).to.equal('remote_with_url')
    })

    it('lease held by remote machine without base_url → 200 local-mirror', async () => {
      const thread_id = _track(_new_thread_id())
      await _acquire(thread_id, 'remote_machine')

      const res = await request(server)
        .get(`/api/threads/${thread_id}`)
        .redirects(0)
      expect(res.status).to.not.equal(307)
      expect(res.headers['x-thread-source']).to.equal('local-mirror')
      expect(res.headers['x-thread-owner']).to.equal('remote_machine')
    })
  })

  describe('write routing — shadow mode (field_ownership_enforce: false)', () => {
    it('session-owned write with remote lease proceeds (shadow allows through)', async () => {
      const thread_id = _track(_new_thread_id())
      await _acquire(thread_id, 'remote_with_url')
      config.thread_config = { field_ownership_enforce: false }

      // PUT session-status uses require_hook_auth (service token), not user JWT
      const res = await request(server)
        .put(`/api/threads/${thread_id}/session-status`)
        .set('Authorization', _auth('local_machine'))
        .send({ session_status: 'active' })
      expect(res.status).to.not.equal(403)
      expect(res.status).to.not.equal(307)
      expect(res.status).to.not.equal(409)
    })
  })

  describe('write routing — enforce mode (field_ownership_enforce: true)', () => {
    beforeEach(() => {
      config.thread_config = { field_ownership_enforce: true }
    })

    afterEach(() => {
      config.thread_config = { field_ownership_enforce: false }
    })

    it('session-owned field write with remote lease → 403 lease_violation', async () => {
      const thread_id = _track(_new_thread_id())
      await _acquire(thread_id, 'remote_with_url')

      const res = await request(server)
        .put(`/api/threads/${thread_id}/session-status`)
        .set('Authorization', _auth('local_machine'))
        .send({ session_status: 'active' })
      expect(res.status).to.equal(403)
      expect(res.body.error).to.equal('lease_violation')
      expect(res.body.field).to.equal('session_status')
    })

    it('lifecycle field write with authenticated user + remote lease + base_url → 307', async () => {
      const thread_id = _track(_new_thread_id())
      await _acquire(thread_id, 'remote_with_url')

      // User makes a state-update request; permission check passes (user is owner),
      // then lease check redirects to lease holder
      const res = await authenticate_request(
        request(server)
          .put(`/api/threads/${thread_id}/state`)
          .send({ thread_state: 'active' }),
        test_user
      ).redirects(0)
      // The route checks user permission first (which allows the user),
      // then the lease write check should 307 redirect
      expect(res.status).to.equal(307)
      expect(res.headers['location']).to.include('https://remote.example.com')
    })

    it('lifecycle field write with authenticated user + remote lease + no base_url → 409', async () => {
      const thread_id = _track(_new_thread_id())
      await _acquire(thread_id, 'remote_machine')

      const res = await authenticate_request(
        request(server)
          .put(`/api/threads/${thread_id}/state`)
          .send({ thread_state: 'active' }),
        test_user
      )
      expect(res.status).to.equal(409)
      expect(res.body.error).to.equal('lease_conflict')
    })
  })
})
