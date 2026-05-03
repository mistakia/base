import os from 'os'
import { expect } from 'chai'

import {
  coemit_acquire_session_lease,
  acquire_session_lease_strict,
  coemit_renew_session_lease,
  coemit_release_session_lease
} from '#libs-server/threads/session-lease-coemit.mjs'
import {
  _clear_cache_for_tests,
  get_cached_lease_snapshot,
  LeaseStoreUnreachable
} from '#libs-server/threads/lease-client.mjs'
import config from '#config'

const _setup_remote_storage = () => {
  const original_registry = config.machine_registry
  config.machine_registry = {
    macbook_test: {
      hostname: os.hostname(),
      platform: os.platform()
    },
    storage_test: {
      hostname: 'storage.unreachable.test',
      platform: 'linux',
      storage: { enabled: true },
      base_url: 'https://storage.test:8443'
    }
  }
  return () => {
    config.machine_registry = original_registry
  }
}

const _make_response = ({ status = 200, body = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  text: async () => JSON.stringify(body)
})

describe('libs-server/threads/session-lease-coemit', function () {
  this.timeout(10000)

  let original_fetch
  let restore_registry

  beforeEach(() => {
    _clear_cache_for_tests()
    original_fetch = global.fetch
    restore_registry = _setup_remote_storage()
  })

  afterEach(() => {
    global.fetch = original_fetch
    if (restore_registry) {
      restore_registry()
      restore_registry = null
    }
  })

  describe('argument handling', () => {
    it('returns silently when thread_id missing', async () => {
      let called = false
      global.fetch = async () => {
        called = true
        return _make_response()
      }
      await coemit_acquire_session_lease({ thread_id: null })
      await coemit_renew_session_lease({ thread_id: null })
      await coemit_release_session_lease({ thread_id: null })
      expect(called).to.equal(false)
    })
  })

  describe('coemit_acquire_session_lease', () => {
    it('issues acquire when no cached snapshot exists', async () => {
      const captured = []
      global.fetch = async (url, init) => {
        captured.push({ url, method: init.method, body: JSON.parse(init.body) })
        return _make_response({
          body: { acquired: true, machine_id: 'macbook_test', lease_token: 1 }
        })
      }
      await coemit_acquire_session_lease({
        thread_id: 't-1',
        session_id: 's-1'
      })
      expect(captured).to.have.lengthOf(1)
      expect(captured[0].url).to.equal(
        'https://storage.test:8443/api/threads/t-1/lease/acquire'
      )
      expect(captured[0].body).to.include({
        machine_id: 'macbook_test',
        session_id: 's-1',
        mode: 'session'
      })
    })

    it('skips HTTP when an owned snapshot is already cached', async () => {
      global.fetch = async () =>
        _make_response({
          body: { acquired: true, machine_id: 'macbook_test', lease_token: 9 }
        })
      await coemit_acquire_session_lease({ thread_id: 't-cached' })

      let called = false
      global.fetch = async () => {
        called = true
        return _make_response({ body: {} })
      }
      await coemit_acquire_session_lease({ thread_id: 't-cached' })
      expect(called).to.equal(false)
    })

    it('retries acquire when cached snapshot reflects a contended (foreign) result', async () => {
      // Seed cache with a contended acquire result owned by another machine
      global.fetch = async () =>
        _make_response({
          body: { acquired: false, machine_id: 'storage_test', lease_token: 4 }
        })
      await coemit_acquire_session_lease({ thread_id: 't-contend' })

      // A subsequent call must NOT short-circuit on the foreign cache entry
      let called = false
      global.fetch = async () => {
        called = true
        return _make_response({
          body: { acquired: true, machine_id: 'macbook_test', lease_token: 5 }
        })
      }
      await coemit_acquire_session_lease({ thread_id: 't-contend' })
      expect(called).to.equal(true)
    })

    it('swallows acquire errors', async () => {
      global.fetch = async () =>
        _make_response({ status: 500, body: { error: 'boom' } })
      await coemit_acquire_session_lease({ thread_id: 't-err' })
    })
  })

  describe('acquire_session_lease_strict', () => {
    it('rethrows LeaseStoreUnreachable on 5xx response', async () => {
      global.fetch = async () =>
        _make_response({ status: 503, body: { error: 'down' } })
      let thrown = null
      try {
        await acquire_session_lease_strict({ thread_id: 't-strict-5xx' })
      } catch (error) {
        thrown = error
      }
      expect(thrown).to.be.an.instanceOf(LeaseStoreUnreachable)
    })

    it('rethrows LeaseStoreUnreachable on network failure', async () => {
      global.fetch = async () => {
        throw new TypeError('connect ECONNREFUSED')
      }
      let thrown = null
      try {
        await acquire_session_lease_strict({ thread_id: 't-strict-net' })
      } catch (error) {
        thrown = error
      }
      expect(thrown).to.be.an.instanceOf(LeaseStoreUnreachable)
    })

    it('does not throw on a definitive 4xx (still best-effort for non-transient)', async () => {
      global.fetch = async () =>
        _make_response({ status: 403, body: { error: 'forbidden' } })
      // 4xx is definitive (not LeaseStoreUnreachable). Strict variant only
      // surfaces transient errors; other failures stay swallowed so a
      // misconfigured token does not crash SessionStart.
      await acquire_session_lease_strict({ thread_id: 't-strict-4xx' })
    })

    it('does not throw on a successful contended acquire', async () => {
      global.fetch = async () =>
        _make_response({
          body: { acquired: false, machine_id: 'storage_test', lease_token: 1 }
        })
      // A foreign-held lease is not a lease-store outage; the route's
      // write-check then handles it (403/redirect).
      await acquire_session_lease_strict({ thread_id: 't-strict-contend' })
    })
  })

  describe('coemit_renew_session_lease', () => {
    it('renews using cached owned lease_token', async () => {
      global.fetch = async () =>
        _make_response({
          body: { acquired: true, machine_id: 'macbook_test', lease_token: 3 }
        })
      await coemit_acquire_session_lease({ thread_id: 't-renew' })

      const captured = []
      global.fetch = async (url, init) => {
        captured.push({ url, body: JSON.parse(init.body) })
        return _make_response({ body: { renewed: true } })
      }
      await coemit_renew_session_lease({ thread_id: 't-renew' })
      expect(captured).to.have.lengthOf(1)
      expect(captured[0].url).to.equal(
        'https://storage.test:8443/api/threads/t-renew/lease/renew'
      )
      expect(captured[0].body.lease_token).to.equal(3)
      expect(captured[0].body.ttl_ms).to.be.greaterThan(0)
    })

    it('lease-recovers via inspect when cache is empty and we own the lease', async () => {
      const calls = []
      global.fetch = async (url, init) => {
        calls.push({ url, method: init.method })
        if (url.endsWith('/lease') && init.method === 'GET') {
          return _make_response({
            body: {
              thread_id: 't-recover',
              machine_id: 'macbook_test',
              lease_token: 11
            }
          })
        }
        if (url.endsWith('/lease/renew') && init.method === 'POST') {
          return _make_response({ body: { renewed: true } })
        }
        return _make_response({ status: 500, body: { error: 'unexpected' } })
      }
      await coemit_renew_session_lease({ thread_id: 't-recover' })
      expect(calls.map((c) => c.method)).to.deep.equal(['GET', 'POST'])
    })

    it('is a no-op when no lease exists', async () => {
      const calls = []
      global.fetch = async (url, init) => {
        calls.push({ url, method: init.method })
        if (url.endsWith('/lease') && init.method === 'GET') {
          return _make_response({ body: null })
        }
        return _make_response({ status: 500, body: { error: 'unexpected' } })
      }
      await coemit_renew_session_lease({ thread_id: 't-fresh' })
      expect(calls.map((c) => c.url.split('/').pop())).to.deep.equal(['lease'])
      expect(calls.every((c) => !c.url.endsWith('/lease/acquire'))).to.equal(
        true
      )
    })

    it('does not extend a foreign-owned lease (skips renew when owner differs)', async () => {
      const calls = []
      global.fetch = async (url, init) => {
        calls.push({ method: init.method, url })
        if (url.endsWith('/lease') && init.method === 'GET') {
          return _make_response({
            body: {
              thread_id: 't-other',
              machine_id: 'storage_test',
              lease_token: 99
            }
          })
        }
        if (url.endsWith('/lease/acquire')) {
          // Acquire request fails because storage holds it
          return _make_response({
            body: {
              acquired: false,
              machine_id: 'storage_test',
              lease_token: 99
            }
          })
        }
        return _make_response({ status: 500, body: { error: 'unexpected' } })
      }
      await coemit_renew_session_lease({ thread_id: 't-other' })
      // No /lease/renew call to a foreign-owned lease
      const renew_calls = calls.filter((c) => c.url.endsWith('/lease/renew'))
      expect(renew_calls).to.have.lengthOf(0)
    })
  })

  describe('coemit_release_session_lease', () => {
    it('releases using cached owned lease_token and clears snapshot', async () => {
      global.fetch = async () =>
        _make_response({
          body: { acquired: true, machine_id: 'macbook_test', lease_token: 5 }
        })
      await coemit_acquire_session_lease({ thread_id: 't-rel' })

      const calls = []
      global.fetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) })
        return _make_response({ body: { released: true } })
      }
      await coemit_release_session_lease({ thread_id: 't-rel' })
      expect(calls).to.have.lengthOf(1)
      expect(calls[0].url).to.equal(
        'https://storage.test:8443/api/threads/t-rel/lease/release'
      )
      expect(calls[0].body.lease_token).to.equal(5)
      expect(get_cached_lease_snapshot({ thread_id: 't-rel' })).to.equal(null)
    })

    it('recovers via inspect_lease when cache is cold and we own the lease', async () => {
      const calls = []
      global.fetch = async (url, init) => {
        calls.push({ url, method: init?.method || 'GET' })
        if (url.endsWith('/lease') && (!init || init.method === 'GET')) {
          return _make_response({
            body: { machine_id: 'macbook_test', lease_token: 9 }
          })
        }
        if (url.endsWith('/lease/release')) {
          return _make_response({ body: { released: true } })
        }
        return _make_response({ body: {} })
      }
      await coemit_release_session_lease({ thread_id: 't-cold-owned' })
      const release_calls = calls.filter((c) => c.url.endsWith('/lease/release'))
      expect(release_calls).to.have.lengthOf(1)
      const inspect_calls = calls.filter(
        (c) => c.url.endsWith('/lease') && c.method === 'GET'
      )
      expect(inspect_calls).to.have.lengthOf(1)
    })

    it('skips release when cache cold and lease store has no record', async () => {
      const calls = []
      global.fetch = async (url, init) => {
        calls.push({ url, method: init?.method || 'GET' })
        if (url.endsWith('/lease') && (!init || init.method === 'GET')) {
          return _make_response({ body: null })
        }
        return _make_response({ body: {} })
      }
      await coemit_release_session_lease({ thread_id: 't-cold-absent' })
      const release_calls = calls.filter((c) => c.url.endsWith('/lease/release'))
      expect(release_calls).to.have.lengthOf(0)
    })

    it('skips release when cache cold and lease in store is foreign-owned', async () => {
      const calls = []
      global.fetch = async (url, init) => {
        calls.push({ url, method: init?.method || 'GET' })
        if (url.endsWith('/lease') && (!init || init.method === 'GET')) {
          return _make_response({
            body: { machine_id: 'storage_test', lease_token: 11 }
          })
        }
        return _make_response({ body: {} })
      }
      await coemit_release_session_lease({ thread_id: 't-cold-foreign' })
      const release_calls = calls.filter((c) => c.url.endsWith('/lease/release'))
      expect(release_calls).to.have.lengthOf(0)
    })

    it('does not release a foreign-owned cached lease', async () => {
      // Seed cache with a contended acquire owned by another machine. The
      // recovery fall-back must still respect machine_id and not release.
      global.fetch = async () =>
        _make_response({
          body: { acquired: false, machine_id: 'storage_test', lease_token: 7 }
        })
      await coemit_acquire_session_lease({ thread_id: 't-foreign' })

      let release_called = false
      global.fetch = async (url, init) => {
        if (url.endsWith('/lease/release')) release_called = true
        if (url.endsWith('/lease') && (!init || init.method === 'GET')) {
          return _make_response({
            body: { machine_id: 'storage_test', lease_token: 7 }
          })
        }
        return _make_response({ body: { released: true } })
      }
      await coemit_release_session_lease({ thread_id: 't-foreign' })
      expect(release_called).to.equal(false)
    })
  })
})
