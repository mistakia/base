import { expect } from 'chai'
import net from 'node:net'

import config from '#config'
import {
  has_capability,
  meets_requirements,
  clear_capability_cache
} from '#libs-server/schedule/capability.mjs'

describe('Capability probes and matcher', function () {
  this.timeout(8000)

  let original_registry
  let original_lan
  let server

  beforeEach(() => {
    original_registry = config.machine_registry
    original_lan = config.lan_networks
    clear_capability_cache()
  })

  afterEach((done) => {
    config.machine_registry = original_registry
    config.lan_networks = original_lan
    if (server) {
      server.close(() => {
        server = null
        done()
      })
    } else {
      done()
    }
  })

  it('meets_requirements short-circuits on empty/nullish requires', async () => {
    expect(await meets_requirements({ requires: [] })).to.deep.equal({
      ok: true,
      missing: []
    })
    expect(await meets_requirements({ requires: undefined })).to.deep.equal({
      ok: true,
      missing: []
    })
    expect(await meets_requirements({ requires: null })).to.deep.equal({
      ok: true,
      missing: []
    })
  })

  it('unknown prefix returns false (fail closed)', async () => {
    const ok = await has_capability({ capability: 'bogus:thing' })
    expect(ok).to.equal(false)
  })

  it('reach probe succeeds against a real listening TCP port', async () => {
    server = await new Promise((resolve, reject) => {
      const s = net.createServer()
      s.once('error', reject)
      s.listen(0, '127.0.0.1', () => resolve(s))
    })
    const port = server.address().port

    config.machine_registry = {
      probe_target: { hostname: '127.0.0.1', reach_probe: { port } }
    }

    const ok = await has_capability({ capability: 'reach:probe_target' })
    expect(ok).to.equal(true)
  })

  it('reach probe fails against a closed TCP port', async () => {
    config.machine_registry = {
      probe_closed: { hostname: '127.0.0.1', reach_probe: { port: 1 } }
    }
    const ok = await has_capability({ capability: 'reach:probe_closed' })
    expect(ok).to.equal(false)
  })

  it('meets_requirements aggregates missing entries', async () => {
    config.machine_registry = {
      probe_closed: { hostname: '127.0.0.1', reach_probe: { port: 1 } }
    }
    const result = await meets_requirements({
      requires: ['reach:probe_closed', 'unknown:foo']
    })
    expect(result.ok).to.equal(false)
    expect(result.missing).to.have.members([
      'reach:probe_closed',
      'unknown:foo'
    ])
  })
})
