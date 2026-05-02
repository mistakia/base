import { describe, it } from 'mocha'
import { expect } from 'chai'
import path from 'path'

import {
  parse_pi_jsonl,
  validate_pi_header,
  migrate_pi_entries,
  PI_SUPPORTED_VERSIONS
} from '#libs-server/integrations/pi/pi-session-helpers.mjs'
import { is_warm_session } from '#libs-server/integrations/claude/claude-session-helpers.mjs'

const FIXTURES = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'pi'
)

describe('Pi Session Helpers', () => {
  it('parses a v3 JSONL file with header + entries', async () => {
    const file = path.join(FIXTURES, 'v3-single-leaf.jsonl')
    const { header, entries } = await parse_pi_jsonl({ file_path: file })
    expect(header.type).to.equal('session')
    expect(header.version).to.equal(3)
    expect(entries.length).to.be.greaterThan(0)
  })

  it('rejects unsupported header versions', () => {
    const r = validate_pi_header({ header: { type: 'session', id: 'x', version: 99 } })
    expect(r.valid).to.equal(false)
    expect(r.reason).to.match(/version/)
  })

  it('accepts versions 1, 2, 3', () => {
    for (const v of PI_SUPPORTED_VERSIONS) {
      const r = validate_pi_header({
        header: { type: 'session', id: 'x', version: v }
      })
      expect(r.valid).to.equal(true)
    }
  })

  it('migrates v1 entries to outer type=message so is_warm_session does not false-skip', () => {
    const header = { type: 'session', id: 'sess', version: 1 }
    const entries = [
      { type: 'assistant', content: 'hello world', timestamp: 1000 }
    ]
    const migrated = migrate_pi_entries({ header, entries })
    expect(migrated[0].type).to.equal('message')
    expect(migrated[0].role).to.equal('assistant')
    expect(migrated[0].id).to.be.a('string')
    // Build a fake claude-shaped session and check warm-session guard
    const fake_claude = {
      entries: migrated.map((m) => ({ type: m.type, message: { content: 'hello' } }))
    }
    expect(is_warm_session({ session: fake_claude })).to.equal(false)
  })

  it('renames v2 hookMessage role to custom', () => {
    const header = { type: 'session', id: 'x', version: 2 }
    const entries = [
      { id: '1', parentId: null, type: 'message', role: 'hookMessage', content: 'h' }
    ]
    const migrated = migrate_pi_entries({ header, entries })
    expect(migrated[0].role).to.equal('custom')
  })
})
