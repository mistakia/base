import { expect } from 'chai'
import IORedis from 'ioredis'
import crypto from 'crypto'

import {
  acquire_lease,
  renew_lease,
  release_lease,
  inspect_lease,
  list_active_leases,
  _close_for_tests
} from '#libs-server/threads/lease-store.mjs'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

const _new_thread_id = () => `test-${crypto.randomBytes(8).toString('hex')}`

describe('libs-server/threads/lease-store', function () {
  this.timeout(10000)

  let cleanup_redis
  const created_thread_ids = []

  before(async () => {
    cleanup_redis = new IORedis(REDIS_URL, { lazyConnect: false })
    try {
      await cleanup_redis.ping()
    } catch (err) {
      this.skip()
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
    if (cleanup_redis) await cleanup_redis.quit()
    await _close_for_tests()
  })

  const _track = (id) => {
    created_thread_ids.push(id)
    return id
  }

  describe('acquire_lease', () => {
    it('acquires a lease and returns lease_token + acquired:true', async () => {
      const thread_id = _track(_new_thread_id())
      const result = await acquire_lease({
        thread_id,
        machine_id: 'macbook',
        ttl_ms: 5000
      })
      expect(result.acquired).to.equal(true)
      expect(result.machine_id).to.equal('macbook')
      expect(result.lease_token).to.be.a('number').and.to.be.at.least(1)
      expect(result.expires_at).to.be.a('number')
    })

    it('second acquire on the same thread returns acquired:false with the holder info', async () => {
      const thread_id = _track(_new_thread_id())
      const first = await acquire_lease({
        thread_id,
        machine_id: 'macbook',
        ttl_ms: 5000
      })
      const second = await acquire_lease({
        thread_id,
        machine_id: 'storage',
        ttl_ms: 5000
      })
      expect(second.acquired).to.equal(false)
      expect(second.machine_id).to.equal('macbook')
      expect(second.lease_token).to.equal(first.lease_token)
    })

    it('returns strictly increasing lease_tokens across consecutive acquires', async () => {
      const thread_id = _track(_new_thread_id())
      const first = await acquire_lease({
        thread_id,
        machine_id: 'macbook',
        ttl_ms: 200
      })
      await release_lease({
        thread_id,
        lease_token: first.lease_token
      })
      const second = await acquire_lease({
        thread_id,
        machine_id: 'macbook',
        ttl_ms: 200
      })
      expect(second.lease_token).to.equal(first.lease_token + 1)
    })

    it('expires automatically after ttl_ms', async () => {
      const thread_id = _track(_new_thread_id())
      await acquire_lease({
        thread_id,
        machine_id: 'macbook',
        ttl_ms: 100
      })
      await new Promise((resolve) => setTimeout(resolve, 200))
      const after = await inspect_lease({ thread_id })
      expect(after).to.equal(null)
      const re_acquired = await acquire_lease({
        thread_id,
        machine_id: 'storage',
        ttl_ms: 1000
      })
      expect(re_acquired.acquired).to.equal(true)
      expect(re_acquired.machine_id).to.equal('storage')
    })

    it('rejects missing parameters', async () => {
      let err
      try {
        await acquire_lease({ thread_id: 'x', machine_id: 'm' })
      } catch (e) {
        err = e
      }
      expect(err).to.be.an('error')
    })
  })

  describe('renew_lease', () => {
    it('extends ttl when token matches', async () => {
      const thread_id = _track(_new_thread_id())
      const acquired = await acquire_lease({
        thread_id,
        machine_id: 'macbook',
        ttl_ms: 200
      })
      const renewed = await renew_lease({
        thread_id,
        lease_token: acquired.lease_token,
        ttl_ms: 5000
      })
      expect(renewed.renewed).to.equal(true)
      expect(renewed.expires_at).to.be.a('number')
      await new Promise((resolve) => setTimeout(resolve, 250))
      const live = await inspect_lease({ thread_id })
      expect(live).to.not.equal(null)
      expect(live.lease_token).to.equal(acquired.lease_token)
    })

    it('does not extend when token mismatches', async () => {
      const thread_id = _track(_new_thread_id())
      const acquired = await acquire_lease({
        thread_id,
        machine_id: 'macbook',
        ttl_ms: 5000
      })
      const renewed = await renew_lease({
        thread_id,
        lease_token: acquired.lease_token + 999,
        ttl_ms: 10000
      })
      expect(renewed.renewed).to.equal(false)
    })

    it('returns renewed:false when no lease exists', async () => {
      const thread_id = _track(_new_thread_id())
      const renewed = await renew_lease({
        thread_id,
        lease_token: 1,
        ttl_ms: 5000
      })
      expect(renewed.renewed).to.equal(false)
    })
  })

  describe('release_lease', () => {
    it('releases when token matches', async () => {
      const thread_id = _track(_new_thread_id())
      const acquired = await acquire_lease({
        thread_id,
        machine_id: 'macbook',
        ttl_ms: 5000
      })
      const released = await release_lease({
        thread_id,
        lease_token: acquired.lease_token
      })
      expect(released.released).to.equal(true)
      const after = await inspect_lease({ thread_id })
      expect(after).to.equal(null)
    })

    it('is a no-op when token mismatches', async () => {
      const thread_id = _track(_new_thread_id())
      const acquired = await acquire_lease({
        thread_id,
        machine_id: 'macbook',
        ttl_ms: 5000
      })
      const released = await release_lease({
        thread_id,
        lease_token: acquired.lease_token + 1
      })
      expect(released.released).to.equal(false)
      const still = await inspect_lease({ thread_id })
      expect(still).to.not.equal(null)
      expect(still.lease_token).to.equal(acquired.lease_token)
    })

    it('is a no-op when no lease exists', async () => {
      const thread_id = _track(_new_thread_id())
      const released = await release_lease({
        thread_id,
        lease_token: 1
      })
      expect(released.released).to.equal(false)
    })
  })

  describe('inspect_lease', () => {
    it('returns null when no lease exists', async () => {
      const thread_id = _track(_new_thread_id())
      const result = await inspect_lease({ thread_id })
      expect(result).to.equal(null)
    })

    it('returns the lease record when held', async () => {
      const thread_id = _track(_new_thread_id())
      const acquired = await acquire_lease({
        thread_id,
        machine_id: 'macbook',
        session_id: 'sess-xyz',
        mode: 'session',
        ttl_ms: 5000
      })
      const inspected = await inspect_lease({ thread_id })
      expect(inspected.machine_id).to.equal('macbook')
      expect(inspected.session_id).to.equal('sess-xyz')
      expect(inspected.mode).to.equal('session')
      expect(inspected.lease_token).to.equal(acquired.lease_token)
    })
  })

  describe('list_active_leases', () => {
    it('returns leases held across all threads, optionally filtered by machine_id', async () => {
      const a = _track(_new_thread_id())
      const b = _track(_new_thread_id())
      const c = _track(_new_thread_id())
      await acquire_lease({
        thread_id: a,
        machine_id: 'macbook',
        ttl_ms: 5000
      })
      await acquire_lease({
        thread_id: b,
        machine_id: 'storage',
        ttl_ms: 5000
      })
      await acquire_lease({
        thread_id: c,
        machine_id: 'macbook',
        ttl_ms: 5000
      })

      const all = await list_active_leases()
      const ids = new Set(all.map((l) => l.thread_id))
      expect(ids.has(a)).to.equal(true)
      expect(ids.has(b)).to.equal(true)
      expect(ids.has(c)).to.equal(true)

      const macbook_only = await list_active_leases({ machine_id: 'macbook' })
      const macbook_ids = new Set(macbook_only.map((l) => l.thread_id))
      expect(macbook_ids.has(a)).to.equal(true)
      expect(macbook_ids.has(c)).to.equal(true)
      expect(macbook_ids.has(b)).to.equal(false)
    })
  })
})
