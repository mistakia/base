import { describe, it } from 'mocha'
import { expect } from 'chai'
import path from 'path'

import { PiSessionProvider } from '#libs-server/integrations/pi/pi-session-provider.mjs'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'pi')

describe('PiSessionProvider', () => {
  it('reports supports_raw_data === false on instance', () => {
    const p = new PiSessionProvider()
    expect(p.supports_raw_data).to.equal(false)
  })

  it('yields one raw session per branch from a multi-leaf file', async () => {
    const p = new PiSessionProvider()
    const sessions = await p.find_sessions({
      pi_sessions_dirs: [path.dirname(FIXTURES)]
    })
    // Sessions dir scan walks subdirs; fixtures/pi/ acts as the project dir.
    const multi = sessions.filter(
      (s) => s.header.id === 'sess-v3-multi'
    )
    expect(multi.length).to.equal(2)
    const ids = multi.map((s) => s.session_id).sort()
    expect(ids).to.deep.equal([
      'sess-v3-multi-branch-0',
      'sess-v3-multi-branch-1'
    ])
  })

  it('exposes non-empty entries alias to dodge is_warm_session false-skip', async () => {
    const p = new PiSessionProvider()
    const sessions = await p.find_sessions({
      pi_sessions_dirs: [path.dirname(FIXTURES)]
    })
    for (const s of sessions) {
      expect(Array.isArray(s.entries)).to.equal(true)
      expect(s.entries.length).to.be.greaterThan(0)
    }
  })

  it('session_id is NOT prefixed with agent-', async () => {
    const p = new PiSessionProvider()
    const sessions = await p.find_sessions({
      pi_sessions_dirs: [path.dirname(FIXTURES)]
    })
    for (const s of sessions) {
      expect(s.session_id.startsWith('agent-')).to.equal(false)
    }
  })

  it('rejects v0/unknown header versions via validate_session', () => {
    const p = new PiSessionProvider()
    const fake = {
      header: { type: 'session', id: 'x', version: 0 },
      branch_entries: [{ id: 'a', type: 'message', role: 'user' }]
    }
    const v = p.validate_session(fake)
    expect(v.valid).to.equal(false)
  })
})
