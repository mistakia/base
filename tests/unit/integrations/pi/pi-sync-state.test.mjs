import { describe, it, afterEach } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import {
  state_path_for_session_file,
  load_pi_sync_state,
  save_pi_sync_state,
  clear_pi_sync_state
} from '#libs-server/integrations/pi/pi-sync-state.mjs'

const SESSION_FILE = '/abs/path/to/sess_abc.jsonl'

describe('pi-sync-state', () => {
  afterEach(async () => {
    await clear_pi_sync_state({ session_file: SESSION_FILE })
  })

  it('state path is deterministic and lives under os.tmpdir()', () => {
    const p1 = state_path_for_session_file(SESSION_FILE)
    const p2 = state_path_for_session_file(SESSION_FILE)
    expect(p1).to.equal(p2)
    expect(p1.startsWith(os.tmpdir())).to.equal(true)
    expect(path.basename(p1)).to.match(/^pi-sync-state-[0-9a-f]{16}\.json$/)
  })

  it('load returns null when no cache file exists', async () => {
    await clear_pi_sync_state({ session_file: SESSION_FILE })
    const state = await load_pi_sync_state({ session_file: SESSION_FILE })
    expect(state).to.equal(null)
  })

  it('round-trip read/write preserves all fields', async () => {
    const state = {
      byte_offset: 1234,
      leaf_id: 'leaf-3',
      branch_thread_id: 'thread-uuid',
      schema_version: 5
    }
    await save_pi_sync_state({ session_file: SESSION_FILE, state })
    const loaded = await load_pi_sync_state({ session_file: SESSION_FILE })
    expect(loaded).to.deep.equal(state)
  })

  it('write is atomic (no .tmp file lingers after rename)', async () => {
    await save_pi_sync_state({
      session_file: SESSION_FILE,
      state: { byte_offset: 1 }
    })
    const target = state_path_for_session_file(SESSION_FILE)
    let tmp_exists = false
    try {
      await fs.stat(target + '.tmp')
      tmp_exists = true
    } catch {}
    expect(tmp_exists).to.equal(false)
  })

  it('load returns null when byte_offset is missing or malformed', async () => {
    const target = state_path_for_session_file(SESSION_FILE)
    await fs.writeFile(target, JSON.stringify({ leaf_id: 'x' }))
    const state = await load_pi_sync_state({ session_file: SESSION_FILE })
    expect(state).to.equal(null)
  })

  it('clear removes the state file (idempotent)', async () => {
    await save_pi_sync_state({
      session_file: SESSION_FILE,
      state: { byte_offset: 1 }
    })
    await clear_pi_sync_state({ session_file: SESSION_FILE })
    await clear_pi_sync_state({ session_file: SESSION_FILE })
    const state = await load_pi_sync_state({ session_file: SESSION_FILE })
    expect(state).to.equal(null)
  })
})
