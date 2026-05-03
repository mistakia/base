/* global describe it before after afterEach */
import os from 'os'
import { expect } from 'chai'
import IORedis from 'ioredis'
import crypto from 'crypto'

import { request } from '#tests/utils/test-request.mjs'
import server from '#server'
import config from '#config'
import { mint_service_token } from '#libs-server/threads/lease-auth.mjs'
import {
  inspect_lease,
  get_cached_lease_snapshot,
  _clear_cache_for_tests
} from '#libs-server/threads/lease-client.mjs'
import { _close_for_tests } from '#libs-server/threads/lease-store.mjs'
import {
  create_test_user,
  create_test_thread,
  create_temp_test_repo,
  reset_all_tables
} from '#tests/utils/index.mjs'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const STORAGE_MACHINE_ID = 'storage_test'
const REQUESTER_MACHINE_ID = 'macbook_test'

// Smoke regression test for the canonical release-then-renew shutdown race.
// Before Task 1 (strict renew), `coemit_renew_session_lease` would call
// `coemit_acquire_session_lease` from a renew trigger when no lease was
// found, leaving an orphaned 2-hour lease bound to nothing. After Task 1,
// renew is a typed no-op when no lease exists.
describe('threads lease shutdown smoke', function () {
  this.timeout(15000)

  let cleanup_redis
  let original_registry
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
    await reset_all_tables()
    test_user = await create_test_user()
  })

  afterEach(async () => {
    for (const thread_id of created_thread_ids.splice(0)) {
      await cleanup_redis.del(
        `lease:thread:${thread_id}`,
        `lease_token:thread:${thread_id}`
      )
    }
    if (test_directories) {
      test_directories.cleanup()
      test_directories = null
    }
  })

  after(async () => {
    if (original_registry !== undefined) {
      config.machine_registry = original_registry
    }
    await reset_all_tables()
    if (cleanup_redis) await cleanup_redis.quit()
    await _close_for_tests()
  })

  const _auth = (machine_id = STORAGE_MACHINE_ID) =>
    `Bearer ${mint_service_token({ machine_id })}`

  it('release-then-renew leaves no orphan lease and never calls acquire from a renew trigger', async () => {
    const test_repo = await create_temp_test_repo({
      prefix: 'lease-shutdown-smoke-',
      register_directories: true
    })
    test_directories = {
      system_path: test_repo.system_path,
      user_path: test_repo.user_path,
      cleanup: test_repo.cleanup
    }
    const thread = await create_test_thread({
      user_public_key: test_user.user_public_key,
      test_directories
    })
    const thread_id = thread.thread_id
    created_thread_ids.push(thread_id)

    // Plant a lease the canonical way.
    const acquire_res = await request(server)
      .post(`/api/threads/${thread_id}/lease/acquire`)
      .set('Authorization', _auth())
      .send({
        machine_id: STORAGE_MACHINE_ID,
        session_id: `sess-${crypto.randomBytes(4).toString('hex')}`,
        ttl_ms: 60000,
        mode: 'session'
      })
    expect(acquire_res.status).to.equal(200)
    expect(acquire_res.body.acquired).to.equal(true)
    const lease_token = acquire_res.body.lease_token

    // Canonical buggy ordering: release lands BEFORE the keepalive renew.
    const release_res = await request(server)
      .post(`/api/threads/${thread_id}/lease/release`)
      .set('Authorization', _auth())
      .send({ lease_token })
    expect(release_res.status).to.equal(200)
    expect(release_res.body.released).to.equal(true)

    // Force the in-process snapshot cache to a known-empty state for this
    // thread so the renew handler must hit inspect_lease and decide there.
    _clear_cache_for_tests()

    // Trigger coemit_renew_session_lease via the keepalive PUT.
    const renew_res = await request(server)
      .put(`/api/threads/${thread_id}/session-status`)
      .send({ session_status: 'idle' })
    expect(renew_res.status).to.equal(200)

    // Discrimination basis: confirmed release immediately above means the
    // lease store and cache are empty for this thread. If the buggy
    // fallback at session-lease-coemit had executed, coemit_acquire would
    // have written a fresh entry to both. Both being null after the renew
    // PUT proves Task 1's strict no-op is in effect.
    const post_inspect = await inspect_lease({ thread_id })
    expect(post_inspect).to.equal(null)
    expect(get_cached_lease_snapshot({ thread_id })).to.equal(null)
  })

  it('cold-cache release recovers via inspect_lease and removes the orphan', async () => {
    const test_repo = await create_temp_test_repo({
      prefix: 'lease-cold-release-smoke-',
      register_directories: true
    })
    test_directories = {
      system_path: test_repo.system_path,
      user_path: test_repo.user_path,
      cleanup: test_repo.cleanup
    }
    const thread = await create_test_thread({
      user_public_key: test_user.user_public_key,
      test_directories
    })
    const thread_id = thread.thread_id
    created_thread_ids.push(thread_id)

    // Plant a lease owned by this machine (the test config makes this host
    // the storage machine, so coemit_release will treat lease.machine_id ===
    // storage_test as ours).
    const session_id = `sess-${crypto.randomBytes(4).toString('hex')}`
    const acquire_res = await request(server)
      .post(`/api/threads/${thread_id}/lease/acquire`)
      .set('Authorization', _auth())
      .send({
        machine_id: STORAGE_MACHINE_ID,
        session_id,
        ttl_ms: 60000,
        mode: 'session'
      })
    expect(acquire_res.status).to.equal(200)
    expect(acquire_res.body.acquired).to.equal(true)

    // Simulate the cold-cache state that produces the orphan: process restart
    // before SessionEnd, contended-acquire overwrite, etc. The lease record
    // remains in Redis but the in-process snapshot is gone.
    _clear_cache_for_tests()
    expect(get_cached_lease_snapshot({ thread_id })).to.equal(null)

    // Fire SessionEnd's release path: PUT session-status=completed routes to
    // coemit_release_session_lease.
    const release_res = await request(server)
      .put(`/api/threads/${thread_id}/session-status`)
      .send({ session_status: 'completed' })
    expect(release_res.status).to.equal(200)

    // Lease must be gone from Redis. Pre-fix this would still be present
    // because coemit_release_session_lease silently no-op'd on cold cache.
    const post_inspect = await inspect_lease({ thread_id })
    expect(post_inspect).to.equal(null)
  })
})
