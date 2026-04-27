import os from 'os'
import { expect } from 'chai'

import {
  acquire_lease,
  renew_lease,
  release_lease,
  inspect_lease,
  list_active_leases,
  get_cached_lease_snapshot,
  LeaseStoreUnreachable,
  LeaseClientConfigError,
  _clear_cache_for_tests
} from '#libs-server/threads/lease-client.mjs'
import config from '#config'

const _setup_remote_storage = ({ base_url = 'https://storage.test:8443' } = {}) => {
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
      base_url
    }
  }
  return () => {
    config.machine_registry = original_registry
  }
}

const _setup_no_base_url = () => {
  const original_registry = config.machine_registry
  config.machine_registry = {
    macbook_test: {
      hostname: os.hostname(),
      platform: os.platform()
    },
    storage_test: {
      hostname: 'storage.unreachable.test',
      platform: 'linux',
      storage: { enabled: true }
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

describe('libs-server/threads/lease-client', function () {
  this.timeout(10000)

  let original_fetch
  let restore_registry

  beforeEach(() => {
    _clear_cache_for_tests()
    original_fetch = global.fetch
  })

  afterEach(() => {
    global.fetch = original_fetch
    if (restore_registry) {
      restore_registry()
      restore_registry = null
    }
  })

  describe('argument validation', () => {
    it('acquire_lease requires thread_id, machine_id, ttl_ms', async () => {
      restore_registry = _setup_remote_storage()
      let err
      try {
        await acquire_lease({})
      } catch (e) {
        err = e
      }
      expect(err?.message).to.match(/thread_id required/)
    })

    it('renew_lease requires lease_token', async () => {
      restore_registry = _setup_remote_storage()
      let err
      try {
        await renew_lease({ thread_id: 't1', ttl_ms: 1000 })
      } catch (e) {
        err = e
      }
      expect(err?.message).to.match(/lease_token required/)
    })

    it('list_active_leases rejects invalid filter', async () => {
      restore_registry = _setup_remote_storage()
      let err
      try {
        await list_active_leases({ filter: 'bogus' })
      } catch (e) {
        err = e
      }
      expect(err?.message).to.match(/filter must be one of/)
    })
  })

  describe('config errors', () => {
    it('throws LeaseClientConfigError when base_url not set', async () => {
      restore_registry = _setup_no_base_url()
      let err
      try {
        await inspect_lease({ thread_id: 't1' })
      } catch (e) {
        err = e
      }
      expect(err).to.be.instanceOf(LeaseClientConfigError)
    })
  })

  describe('HTTP transport', () => {
    it('inspect_lease GETs and returns parsed body, updates snapshot', async () => {
      restore_registry = _setup_remote_storage()
      const lease = {
        thread_id: 't-abc',
        machine_id: 'macbook_test',
        lease_token: 1,
        expires_at: Date.now() + 5000
      }
      let captured_url
      let captured_init
      global.fetch = async (url, init) => {
        captured_url = url
        captured_init = init
        return _make_response({ body: lease })
      }
      const result = await inspect_lease({ thread_id: 't-abc' })
      expect(result).to.deep.equal(lease)
      expect(captured_url).to.equal(
        'https://storage.test:8443/api/threads/t-abc/lease'
      )
      expect(captured_init.method).to.equal('GET')
      expect(captured_init.headers.Authorization).to.match(/^Bearer /)
      expect(get_cached_lease_snapshot({ thread_id: 't-abc' })).to.deep.equal(
        lease
      )
    })

    it('acquire_lease POSTs body and caches result', async () => {
      restore_registry = _setup_remote_storage()
      const response_body = {
        acquired: true,
        machine_id: 'macbook_test',
        lease_token: 7
      }
      let captured_body
      global.fetch = async (_url, init) => {
        captured_body = JSON.parse(init.body)
        return _make_response({ body: response_body })
      }
      const result = await acquire_lease({
        thread_id: 't-acq',
        machine_id: 'macbook_test',
        ttl_ms: 60000
      })
      expect(result).to.deep.equal(response_body)
      expect(captured_body).to.include({
        machine_id: 'macbook_test',
        ttl_ms: 60000,
        mode: 'session'
      })
      expect(get_cached_lease_snapshot({ thread_id: 't-acq' })).to.deep.equal(
        response_body
      )
    })

    it('release_lease clears the snapshot on success', async () => {
      restore_registry = _setup_remote_storage()
      global.fetch = async () =>
        _make_response({ body: { released: true } })
      // Seed cache via inspect
      global.fetch = async () =>
        _make_response({
          body: { thread_id: 't-rel', lease_token: 4 }
        })
      await inspect_lease({ thread_id: 't-rel' })
      expect(get_cached_lease_snapshot({ thread_id: 't-rel' })).to.not.equal(
        null
      )
      global.fetch = async () =>
        _make_response({ body: { released: true } })
      const result = await release_lease({
        thread_id: 't-rel',
        lease_token: 4
      })
      expect(result.released).to.equal(true)
      expect(get_cached_lease_snapshot({ thread_id: 't-rel' })).to.equal(null)
    })

    it('renew_lease POSTs to renew endpoint', async () => {
      restore_registry = _setup_remote_storage()
      let captured_url
      global.fetch = async (url) => {
        captured_url = url
        return _make_response({
          body: { renewed: true, expires_at: Date.now() + 5000 }
        })
      }
      const result = await renew_lease({
        thread_id: 't-ren',
        lease_token: 2,
        ttl_ms: 5000
      })
      expect(result.renewed).to.equal(true)
      expect(captured_url).to.match(/\/api\/threads\/t-ren\/lease\/renew$/)
    })

    it('list_active_leases passes filter as query param', async () => {
      restore_registry = _setup_remote_storage()
      let captured_url
      global.fetch = async (url) => {
        captured_url = url
        return _make_response({ body: { leases: [{ thread_id: 'x' }] } })
      }
      const result = await list_active_leases({ filter: 'owned-by-me' })
      expect(result).to.deep.equal([{ thread_id: 'x' }])
      expect(captured_url).to.match(/filter=owned-by-me$/)
    })
  })

  describe('failure modes', () => {
    it('list_active_leases throws LeaseStoreUnreachable after retries', async () => {
      restore_registry = _setup_remote_storage()
      let calls = 0
      global.fetch = async () => {
        calls += 1
        throw new Error('ECONNREFUSED')
      }
      let err
      try {
        await list_active_leases({ filter: 'all' })
      } catch (e) {
        err = e
      }
      expect(err).to.be.instanceOf(LeaseStoreUnreachable)
      expect(calls).to.equal(3)
    })

    it('inspect_lease propagates HTTP error without retry', async () => {
      restore_registry = _setup_remote_storage()
      let calls = 0
      global.fetch = async () => {
        calls += 1
        return _make_response({ status: 500, body: { error: 'boom' } })
      }
      let err
      try {
        await inspect_lease({ thread_id: 't-err' })
      } catch (e) {
        err = e
      }
      expect(err).to.exist
      expect(err.message).to.match(/500/)
      expect(calls).to.equal(1)
    })
  })
})
