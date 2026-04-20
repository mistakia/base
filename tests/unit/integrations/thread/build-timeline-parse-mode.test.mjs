import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { acquire_thread_import_lock } from '#libs-server/threads/timeline/thread-import-lock.mjs'
import { seed_thread_metadata } from '#tests/utils/index.mjs'

const THREAD_ID = '33333333-3333-3333-3333-333333333333'

const make_session = ({ parse_mode, messages }) => ({
  session_id: 'session-timeline',
  session_provider: 'claude',
  parse_mode,
  messages,
  metadata: {}
})

const make_message = ({ id, timestamp, source_uuid, sequence, content }) => ({
  id,
  type: 'message',
  role: 'user',
  timestamp: new Date(timestamp),
  content,
  ordering: { sequence, source_uuid, parent_id: null }
})

const read_entries = async (thread_dir) => {
  const raw = await fs.readFile(path.join(thread_dir, 'timeline.jsonl'), 'utf8')
  return raw
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))
}

describe('build_timeline_from_session parse_mode branching', function () {
  let thread_dir

  beforeEach(async () => {
    thread_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'build-timeline-'))
    await seed_thread_metadata({ thread_dir, thread_id: THREAD_ID })
  })

  afterEach(async () => {
    await fs.rm(thread_dir, { recursive: true, force: true })
  })

  it('full with no existing file creates file and writes entries', async () => {
    const session = make_session({
      parse_mode: 'full',
      messages: [
        make_message({
          id: 'm1',
          timestamp: '2026-04-18T12:00:00.000Z',
          source_uuid: 's1',
          sequence: 10000,
          content: 'a'
        })
      ]
    })
    await build_timeline_from_session(session, {
      thread_id: THREAD_ID,
      thread_dir
    })
    const entries = await read_entries(thread_dir)
    expect(entries).to.have.lengthOf(1)
    expect(entries[0].id).to.equal('m1')
  })

  it('full with existing file truncates and preserves inode', async () => {
    const first = make_session({
      parse_mode: 'full',
      messages: [
        make_message({
          id: 'old-1',
          timestamp: '2026-04-18T12:00:00.000Z',
          source_uuid: 's1',
          sequence: 10000,
          content: 'old'
        })
      ]
    })
    await build_timeline_from_session(first, {
      thread_id: THREAD_ID,
      thread_dir
    })
    const timeline_path = path.join(thread_dir, 'timeline.jsonl')
    const before_ino = (await fs.stat(timeline_path)).ino

    const second = make_session({
      parse_mode: 'full',
      messages: [
        make_message({
          id: 'new-1',
          timestamp: '2026-04-18T13:00:00.000Z',
          source_uuid: 's2',
          sequence: 20000,
          content: 'new'
        })
      ]
    })
    await build_timeline_from_session(second, {
      thread_id: THREAD_ID,
      thread_dir
    })
    const after_ino = (await fs.stat(timeline_path)).ino
    expect(after_ino).to.equal(before_ino)

    const entries = await read_entries(thread_dir)
    expect(entries.map((e) => e.id)).to.deep.equal(['new-1'])
  })

  it('delta with existing file appends and preserves prior entries', async () => {
    const full = make_session({
      parse_mode: 'full',
      messages: [
        make_message({
          id: 'm1',
          timestamp: '2026-04-18T12:00:00.000Z',
          source_uuid: 's1',
          sequence: 10000,
          content: 'first'
        })
      ]
    })
    await build_timeline_from_session(full, {
      thread_id: THREAD_ID,
      thread_dir
    })

    const delta = make_session({
      parse_mode: 'delta',
      messages: [
        make_message({
          id: 'm2',
          timestamp: '2026-04-18T13:00:00.000Z',
          source_uuid: 's2',
          sequence: 20000,
          content: 'second'
        })
      ]
    })
    await build_timeline_from_session(delta, {
      thread_id: THREAD_ID,
      thread_dir
    })

    const entries = await read_entries(thread_dir)
    expect(entries.map((e) => e.id)).to.deep.equal(['m1', 'm2'])
  })

  it('delta with empty entries is a no-op', async () => {
    const full = make_session({
      parse_mode: 'full',
      messages: [
        make_message({
          id: 'm1',
          timestamp: '2026-04-18T12:00:00.000Z',
          source_uuid: 's1',
          sequence: 10000,
          content: 'first'
        })
      ]
    })
    await build_timeline_from_session(full, {
      thread_id: THREAD_ID,
      thread_dir
    })

    const delta = make_session({ parse_mode: 'delta', messages: [] })
    const result = await build_timeline_from_session(delta, {
      thread_id: THREAD_ID,
      thread_dir
    })
    expect(result.timeline_modified).to.equal(false)

    const entries = await read_entries(thread_dir)
    expect(entries.map((e) => e.id)).to.deep.equal(['m1'])
  })

  it('concurrent writes serialize under the import lock', async () => {
    const run_locked = async ({ parse_mode, messages }) => {
      const lock = await acquire_thread_import_lock({ thread_dir })
      try {
        await build_timeline_from_session(
          make_session({ parse_mode, messages }),
          { thread_id: THREAD_ID, thread_dir }
        )
      } finally {
        await lock.release()
      }
    }

    await run_locked({
      parse_mode: 'full',
      messages: [
        make_message({
          id: 'm0',
          timestamp: '2026-04-18T12:00:00.000Z',
          source_uuid: 's0',
          sequence: 10000,
          content: 'zero'
        })
      ]
    })

    await Promise.all([
      run_locked({
        parse_mode: 'delta',
        messages: [
          make_message({
            id: 'm1',
            timestamp: '2026-04-18T12:01:00.000Z',
            source_uuid: 's1',
            sequence: 20000,
            content: 'one'
          })
        ]
      }),
      run_locked({
        parse_mode: 'delta',
        messages: [
          make_message({
            id: 'm2',
            timestamp: '2026-04-18T12:02:00.000Z',
            source_uuid: 's2',
            sequence: 30000,
            content: 'two'
          })
        ]
      })
    ])

    const entries = await read_entries(thread_dir)
    const ids = entries.map((e) => e.id).sort()
    expect(ids).to.deep.equal(['m0', 'm1', 'm2'])
    // Each write produced exactly one line; no partial interleaving.
    expect(entries.length).to.equal(3)
  })
})
