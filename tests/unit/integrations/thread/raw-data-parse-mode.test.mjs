import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { save_raw_session_data } from '#libs-server/integrations/thread/create-from-session.mjs'
import { acquire_thread_import_lock } from '#libs-server/threads/timeline/thread-import-lock.mjs'

const make_entry = (uuid, line_number) => ({
  uuid,
  parentUuid: null,
  timestamp: '2026-04-18T12:00:00.000Z',
  type: 'user',
  line_number,
  message: { role: 'user', content: 'x' }
})

const read_jsonl = async (raw_data_dir) => {
  const raw = await fs.readFile(
    path.join(raw_data_dir, 'claude-session.jsonl'),
    'utf8'
  )
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line))
}

describe('save_raw_session_data parse_mode branching (claude)', function () {
  let raw_data_dir

  beforeEach(async () => {
    raw_data_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'raw-data-'))
  })

  afterEach(async () => {
    await fs.rm(raw_data_dir, { recursive: true, force: true })
  })

  const run = async ({ parse_mode, entries }) => {
    await save_raw_session_data({
      raw_data_dir,
      session_provider: 'claude',
      raw_session_data: { entries: [...entries], metadata: null },
      normalized_session: { session_id: null, parse_mode }
    })
  }

  it('full with no existing file creates and writes entries', async () => {
    await run({ parse_mode: 'full', entries: [make_entry('u1', 1)] })
    const entries = await read_jsonl(raw_data_dir)
    expect(entries).to.have.lengthOf(1)
    expect(entries[0].uuid).to.equal('u1')
  })

  it('full with existing file truncates and preserves inode', async () => {
    await run({ parse_mode: 'full', entries: [make_entry('old', 1)] })
    const jsonl_path = path.join(raw_data_dir, 'claude-session.jsonl')
    const before_ino = (await fs.stat(jsonl_path)).ino

    await run({ parse_mode: 'full', entries: [make_entry('new', 1)] })
    const after_ino = (await fs.stat(jsonl_path)).ino
    expect(after_ino).to.equal(before_ino)

    const entries = await read_jsonl(raw_data_dir)
    expect(entries.map((e) => e.uuid)).to.deep.equal(['new'])
  })

  it('delta with existing file appends and preserves prior entries', async () => {
    await run({ parse_mode: 'full', entries: [make_entry('u1', 1)] })
    await run({ parse_mode: 'delta', entries: [make_entry('u2', 2)] })

    const entries = await read_jsonl(raw_data_dir)
    expect(entries.map((e) => e.uuid)).to.deep.equal(['u1', 'u2'])
  })

  it('delta with empty entries does not change the file', async () => {
    await run({ parse_mode: 'full', entries: [make_entry('u1', 1)] })
    const jsonl_path = path.join(raw_data_dir, 'claude-session.jsonl')
    const before = await fs.readFile(jsonl_path, 'utf8')

    await run({ parse_mode: 'delta', entries: [] })

    const after = await fs.readFile(jsonl_path, 'utf8')
    expect(after).to.equal(before)
  })

  it('concurrent writes serialize under the import lock', async () => {
    const run_locked = async ({ parse_mode, entries }) => {
      const lock = await acquire_thread_import_lock({ thread_dir: raw_data_dir })
      try {
        await run({ parse_mode, entries })
      } finally {
        await lock.release()
      }
    }

    await run_locked({ parse_mode: 'full', entries: [make_entry('u0', 1)] })

    await Promise.all([
      run_locked({ parse_mode: 'delta', entries: [make_entry('u1', 2)] }),
      run_locked({ parse_mode: 'delta', entries: [make_entry('u2', 3)] })
    ])

    const entries = await read_jsonl(raw_data_dir)
    const uuids = entries.map((e) => e.uuid).sort()
    expect(uuids).to.deep.equal(['u0', 'u1', 'u2'])
    expect(entries.length).to.equal(3)
  })
})
