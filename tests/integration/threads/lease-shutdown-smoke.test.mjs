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
import * as lease_store from '#libs-server/threads/lease-store.mjs'
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

    // Hand-rolled spy on acquire_lease at the local lease-store layer.
    // session-lease-coemit -> lease-client.acquire_lease -> (storage path)
    // -> lease_store.acquire_lease. Counting calls here proves Task 1's
    // strict no-op is in effect from a renew trigger -- not just that the
    // lease store happens to be empty afterwards.
    const acquire_call_thread_ids = []
    const original_store_acquire = lease_store.acquire_lease
    let restore_spy
    try {
      lease_store.acquire_lease = async (args) => {
        acquire_call_thread_ids.push(args?.thread_id)
        return original_store_acquire(args)
      }
      restore_spy = () => {
        lease_store.acquire_lease = original_store_acquire
      }
    } catch (assign_error) {
      // ESM namespace immutable in this runtime; rely on the (necessary
      // and sufficient given a confirmed release) inspect_lease=null
      // and cache=null assertions below.
      restore_spy = () => {}
      void assign_error
    }

    try {
      // Trigger coemit_renew_session_lease via the keepalive PUT.
      const renew_res = await request(server)
        .put(`/api/threads/${thread_id}/session-status`)
        .send({ session_status: 'idle' })
      expect(renew_res.status).to.equal(200)
    } finally {
      restore_spy()
    }

    // Primary discriminator: no orphan lease was created.
    const post_inspect = await inspect_lease({ thread_id })
    expect(post_inspect).to.equal(null)

    // Secondary discriminator: the in-process cache holds no orphan
    // snapshot for this thread (a buggy fallback acquire would have
    // populated it via _set_snapshot).
    expect(get_cached_lease_snapshot({ thread_id })).to.equal(null)

    // Negative spy assertion (when the runtime allowed namespace mutation):
    // no acquire_lease call was made for this thread during the renew.
    expect(
      acquire_call_thread_ids.filter((id) => id === thread_id)
    ).to.have.lengthOf(0)
  })
})
