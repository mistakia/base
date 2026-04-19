import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { seed_thread_metadata } from '#tests/utils/index.mjs'

const EPOCH_ISO = '1970-01-01T00:00:00.000Z'
const THREAD_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const read_entries = async (thread_dir) => {
  const raw = await fs.readFile(path.join(thread_dir, 'timeline.jsonl'), 'utf8')
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line))
}

const build = async (messages) => {
  const thread_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'timestamp-sentinel-'))
  await seed_thread_metadata({ thread_dir, thread_id: THREAD_ID })
  const normalized_session = {
    session_id: 'session-test',
    session_provider: 'claude',
    parse_mode: 'full',
    messages,
    metadata: {}
  }
  await build_timeline_from_session(normalized_session, {
    thread_id: THREAD_ID,
    thread_dir
  })
  const entries = await read_entries(thread_dir)
  await fs.rm(thread_dir, { recursive: true, force: true })
  return entries
}

const make_message = (overrides) => ({
  id: 'msg-1',
  type: 'message',
  role: 'user',
  content: 'hello',
  ordering: { sequence: 10000, source_uuid: 'src-1', parent_id: null },
  ...overrides
})

describe('convert_message_to_timeline_entry timestamp sentinel', () => {
  it('emits EPOCH_ISO when message.timestamp is null', async () => {
    const [entry] = await build([make_message({ timestamp: null })])
    expect(entry.timestamp).to.equal(EPOCH_ISO)
  })

  it('emits EPOCH_ISO when message.timestamp is unparseable', async () => {
    const [entry] = await build([make_message({ timestamp: 'not-a-date' })])
    expect(entry.timestamp).to.equal(EPOCH_ISO)
  })

  it('preserves a valid ISO timestamp unchanged', async () => {
    const [entry] = await build([
      make_message({ timestamp: '2026-04-18T12:00:00.000Z' })
    ])
    expect(entry.timestamp).to.equal('2026-04-18T12:00:00.000Z')
  })

  it('normalizes a Date timestamp to ISO form', async () => {
    const [entry] = await build([
      make_message({ timestamp: new Date('2026-04-18T12:00:00.000Z') })
    ])
    expect(entry.timestamp).to.equal('2026-04-18T12:00:00.000Z')
  })
})
