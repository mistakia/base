import { describe, it, beforeEach, afterEach } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { save_raw_session_data } from '#libs-server/integrations/thread/create-from-session.mjs'
import { find_claude_sessions_from_filesystem } from '#libs-server/integrations/claude/claude-session-helpers.mjs'
import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'
import { clear_sync_state } from '#libs-server/integrations/claude/sync-state.mjs'
import {
  make_claude_entry,
  serialize_claude_entries
} from '#tests/utils/claude-jsonl-fixtures.mjs'

describe('save_claude_raw_data snapshot semantics', function () {
  this.timeout(10000)

  let work_dir
  let session_file
  let raw_data_dir

  beforeEach(async () => {
    work_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-test-'))
    session_file = path.join(work_dir, 'live-session.jsonl')
    raw_data_dir = path.join(work_dir, 'raw-data')
    await fs.mkdir(raw_data_dir, { recursive: true })
  })

  afterEach(async () => {
    await clear_sync_state({ session_id: session_file }).catch(() => {})
    await fs.rm(work_dir, { recursive: true, force: true })
  })

  it('full parse then incremental parse produces a byte-for-byte snapshot of the live source', async () => {
    const initial = [
      make_claude_entry('u1', 1),
      make_claude_entry('u2', 2, 'assistant'),
      make_claude_entry('u3', 3)
    ]
    await fs.writeFile(session_file, serialize_claude_entries(initial))

    const run = async () => {
      const sessions = await find_claude_sessions_from_filesystem({
        session_file
      })
      for (const session of sessions) {
        const normalized = normalize_claude_session(session)
        await save_raw_session_data({
          raw_data_dir,
          session_provider: 'claude',
          raw_session_data: session,
          normalized_session: normalized
        })
      }
    }

    await run() // first pass = full
    const appended = [
      make_claude_entry('u4', 4, 'assistant'),
      make_claude_entry('u5', 5)
    ]
    await fs.appendFile(session_file, serialize_claude_entries(appended))
    await run() // second pass = delta/incremental

    const snapshot_path = path.join(raw_data_dir, 'claude-session.jsonl')
    const live_bytes = await fs.readFile(session_file)
    const snapshot_bytes = await fs.readFile(snapshot_path)
    expect(snapshot_bytes.equals(live_bytes)).to.equal(true)
  })

  it('throws when raw_data has no metadata.file_path', async () => {
    const synthetic = {
      session_id: '00000000-0000-4000-8000-000000000002',
      entries: [make_claude_entry('a', 1)],
      metadata: { cwd: '/tmp/cwd' },
      parse_mode: 'full'
    }
    const normalized = normalize_claude_session(synthetic)

    let caught
    try {
      await save_raw_session_data({
        raw_data_dir,
        session_provider: 'claude',
        raw_session_data: { metadata: synthetic.metadata },
        normalized_session: { ...normalized, parse_mode: 'full' }
      })
    } catch (error) {
      caught = error
    }
    expect(caught).to.be.an('error')
    expect(caught.message).to.include('file_path is required')
  })
})
