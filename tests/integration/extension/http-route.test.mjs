/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'
import express from 'express'

import server, { mount_extension_routes } from '#server'
import { request } from '#tests/utils/test-request.mjs'
import {
  register,
  _reset
} from '#libs-server/extension/capability-registry.mjs'

describe('extension http-route capability', function () {
  this.timeout(15000)

  beforeEach(() => {
    _reset()
  })

  afterEach(() => {
    _reset()
  })

  it('mounts a provider route and serves responses', async () => {
    const router = express.Router()
    router.get('/ping', (req, res) => {
      res.json({ ok: true, authenticated: Boolean(req.is_authenticated) })
    })

    register('http-route', 'mock-ext', {
      routes: [
        {
          mount_path: '/api/mock-ext',
          rate_limit_tier: 'read',
          router
        }
      ]
    })

    const result = mount_extension_routes()
    expect(result.mounted).to.equal(1)
    expect(result.providers).to.equal(1)

    const res = await request(server).get('/api/mock-ext/ping')
    expect(res.status).to.equal(200)
    expect(res.body).to.deep.equal({ ok: true, authenticated: false })
  })

  it('rejects mount paths that do not start with /api/', () => {
    const router = express.Router()
    router.get('/ping', (req, res) => res.json({ ok: true }))

    register('http-route', 'bad-ext', {
      routes: [
        {
          mount_path: '/bad-prefix',
          router
        }
      ]
    })

    const result = mount_extension_routes()
    expect(result.mounted).to.equal(0)
    expect(result.providers).to.equal(1)
  })

  it('defaults rate_limit_tier to read when omitted', async () => {
    const router = express.Router()
    router.get('/default-tier', (req, res) => {
      res.json({ tier: 'default' })
    })

    register('http-route', 'default-tier-ext', {
      routes: [
        {
          mount_path: '/api/default-tier-ext',
          router
        }
      ]
    })

    const result = mount_extension_routes()
    expect(result.mounted).to.equal(1)

    const res = await request(server).get('/api/default-tier-ext/default-tier')
    expect(res.status).to.equal(200)
    expect(res.body).to.deep.equal({ tier: 'default' })
  })

  it('skips descriptors with invalid rate_limit_tier', () => {
    const router = express.Router()
    register('http-route', 'invalid-tier-ext', {
      routes: [
        {
          mount_path: '/api/invalid-tier-ext',
          rate_limit_tier: 'bogus',
          router
        }
      ]
    })

    const result = mount_extension_routes()
    expect(result.mounted).to.equal(0)
    expect(result.providers).to.equal(1)
  })

  it('returns zero when no providers are registered', () => {
    const result = mount_extension_routes()
    expect(result.mounted).to.equal(0)
    expect(result.providers).to.equal(0)
  })

  it('is idempotent: re-mounting clears prior routes', async () => {
    const first = express.Router()
    first.get('/v1', (req, res) => res.json({ version: 1 }))
    register('http-route', 'versioned-ext', {
      routes: [{ mount_path: '/api/versioned', router: first }]
    })
    mount_extension_routes()

    let res = await request(server).get('/api/versioned/v1')
    expect(res.status).to.equal(200)
    expect(res.body).to.deep.equal({ version: 1 })

    // Re-register with a new router on the same path and re-mount
    _reset()
    const second = express.Router()
    second.get('/v2', (req, res) => res.json({ version: 2 }))
    register('http-route', 'versioned-ext', {
      routes: [{ mount_path: '/api/versioned', router: second }]
    })
    mount_extension_routes()

    // The new route responds
    res = await request(server).get('/api/versioned/v2')
    expect(res.status).to.equal(200)
    expect(res.body).to.deep.equal({ version: 2 })

    // The old route is gone (404 -- SPA/error fallback)
    res = await request(server).get('/api/versioned/v1')
    expect(res.status).to.not.equal(200)
  })
})
