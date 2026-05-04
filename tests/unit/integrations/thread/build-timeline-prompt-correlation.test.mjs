import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { seed_thread_metadata } from '#tests/utils/index.mjs'

const THREAD_ID = '44444444-4444-4444-4444-444444444444'

const read_entries = async (thread_dir) => {
  const raw = await fs.readFile(path.join(thread_dir, 'timeline.jsonl'), 'utf8')
  return raw
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))
}

describe('build_timeline_from_session prompt_correlation_id passthrough', function () {
  let thread_dir

  beforeEach(async () => {
    thread_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'build-timeline-corr-'))
    await seed_thread_metadata({ thread_dir, thread_id: THREAD_ID })
  })

  afterEach(async () => {
    await fs.rm(thread_dir, { recursive: true, force: true })
  })

  it('persists prompt_correlation_id from a tagged user message', async () => {
    const session = {
      session_id: 'session-corr',
      session_provider: 'claude',
      parse_mode: 'full',
      messages: [
        {
          id: 'm1',
          type: 'message',
          role: 'user',
          timestamp: new Date('2026-04-18T12:00:00.000Z'),
          content: 'hello',
          ordering: { sequence: 10000, source_uuid: 's1', parent_id: null },
          prompt_correlation_id: 'corr-K'
        }
      ],
      metadata: {}
    }

    await build_timeline_from_session(session, {
      thread_id: THREAD_ID,
      thread_dir
    })

    const entries = await read_entries(thread_dir)
    const message_entry = entries.find((e) => e.type === 'message')
    expect(message_entry).to.exist
    expect(message_entry.prompt_correlation_id).to.equal('corr-K')
  })

  it('does not stamp prompt_correlation_id when source message has none', async () => {
    const session = {
      session_id: 'session-untagged',
      session_provider: 'claude',
      parse_mode: 'full',
      messages: [
        {
          id: 'm1',
          type: 'message',
          role: 'user',
          timestamp: new Date('2026-04-18T12:00:00.000Z'),
          content: 'hello',
          ordering: { sequence: 10000, source_uuid: 's1', parent_id: null }
        }
      ],
      metadata: {}
    }

    await build_timeline_from_session(session, {
      thread_id: THREAD_ID,
      thread_dir
    })

    const entries = await read_entries(thread_dir)
    const message_entry = entries.find((e) => e.type === 'message')
    expect(message_entry).to.exist
    expect(message_entry.prompt_correlation_id).to.be.undefined
  })
})
