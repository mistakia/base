import { describe, it } from 'mocha'
import { expect } from 'chai'
import path from 'path'

import { import_pi_sessions } from '#libs-server/integrations/pi/index.mjs'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'pi')

describe('import_pi_sessions session_file plumbing', () => {
  it('dry_run forwards session_file into provider stream and finds branches', async () => {
    const result = await import_pi_sessions({
      session_file: path.join(FIXTURES, 'v3-multi-leaf.jsonl'),
      dry_run: true
    })
    expect(result.dry_run).to.equal(true)
    expect(result.sessions_found).to.equal(2)
    expect(result.valid_sessions).to.equal(2)
  })

  it('dry_run with single_leaf_only yields only the active-leaf branch', async () => {
    const result = await import_pi_sessions({
      session_file: path.join(FIXTURES, 'v3-multi-leaf.jsonl'),
      single_leaf_only: true,
      dry_run: true
    })
    expect(result.sessions_found).to.equal(1)
    expect(result.valid_sessions).to.equal(1)
  })

  it('session_file overrides from_date/to_date filtering', async () => {
    const result = await import_pi_sessions({
      session_file: path.join(FIXTURES, 'v3-multi-leaf.jsonl'),
      from_date: '2099-01-01',
      to_date: '2099-12-31',
      dry_run: true
    })
    expect(result.sessions_found).to.equal(2)
  })
})
