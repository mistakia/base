import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'
import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'

const SESSION_ID = '11111111-1111-1111-1111-111111111111'
const THREAD_ID = '22222222-2222-2222-2222-222222222222'

const read_entries = async (thread_dir) => {
  const raw = await fs.readFile(path.join(thread_dir, 'timeline.jsonl'), 'utf8')
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line))
}

const write_timeline = async (normalized_session) => {
  const thread_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ordering-'))
  await build_timeline_from_session(normalized_session, {
    thread_id: THREAD_ID,
    thread_dir
  })
  const entries = await read_entries(thread_dir)
  await fs.rm(thread_dir, { recursive: true, force: true })
  return entries
}

describe('ordering passthrough and composite sequence', () => {
  it('main claude message gets ordering.sequence = line_number * 10000 and source_uuid = entry.uuid', () => {
    const session = {
      session_id: SESSION_ID,
      entries: [
        {
          uuid: 'entry-uuid-a',
          parentUuid: null,
          timestamp: '2026-04-18T12:00:00.000Z',
          type: 'user',
          line_number: 7,
          message: { role: 'user', content: 'hello' }
        }
      ],
      metadata: {}
    }

    const normalized = normalize_claude_session(session)
    const [main] = normalized.messages
    expect(main.ordering.sequence).to.equal(7 * 10000)
    expect(main.ordering.source_uuid).to.equal('entry-uuid-a')
  })

  it('thinking sub-entries get distinct sequences sharing parent source_uuid', () => {
    const session = {
      session_id: SESSION_ID,
      entries: [
        {
          uuid: 'entry-uuid-b',
          parentUuid: null,
          timestamp: '2026-04-18T12:00:00.000Z',
          type: 'assistant',
          line_number: 11,
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', content: 'thought 1' },
              { type: 'thinking', content: 'thought 2' }
            ]
          }
        }
      ],
      metadata: {}
    }

    const normalized = normalize_claude_session(session)
    const thinking = normalized.messages.filter((m) => m.type === 'thinking')
    expect(thinking).to.have.lengthOf(2)
    expect(thinking[0].ordering.sequence).to.equal(11 * 10000 + 1)
    expect(thinking[1].ordering.sequence).to.equal(11 * 10000 + 2)
    expect(thinking[0].ordering.source_uuid).to.equal('entry-uuid-b')
    expect(thinking[1].ordering.source_uuid).to.equal('entry-uuid-b')
  })

  it('tool_use sub-entry uses composite formula via shared helper', () => {
    const session = {
      session_id: SESSION_ID,
      entries: [
        {
          uuid: 'entry-uuid-c',
          parentUuid: null,
          timestamp: '2026-04-18T12:00:00.000Z',
          type: 'assistant',
          line_number: 19,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tc-1',
                name: 'bash',
                input: { cmd: 'ls' }
              }
            ]
          }
        }
      ],
      metadata: {}
    }

    const normalized = normalize_claude_session(session)
    const tool_call = normalized.messages.find((m) => m.type === 'tool_call')
    expect(tool_call).to.exist
    expect(tool_call.ordering.sequence).to.equal(19 * 10000 + 1)
    expect(tool_call.ordering.source_uuid).to.equal('entry-uuid-c')
  })

  it('final timeline entry preserves ordering.source_uuid and ordering.sequence from normalizer', async () => {
    const normalized_session = {
      session_id: SESSION_ID,
      session_provider: 'claude',
      parse_mode: 'full',
      messages: [
        {
          id: 'msg-1',
          type: 'message',
          role: 'user',
          timestamp: new Date('2026-04-18T12:00:00.000Z'),
          content: 'hello',
          ordering: { sequence: 50000, source_uuid: 'src-uuid-1', parent_id: null }
        }
      ],
      metadata: {}
    }

    const [entry] = await write_timeline(normalized_session)
    expect(entry.ordering.sequence).to.equal(50000)
    expect(entry.ordering.source_uuid).to.equal('src-uuid-1')
  })

  it('normalized message without ordering gets fallback {sequence: sequence_index, parent_id}', async () => {
    const normalized_session = {
      session_id: SESSION_ID,
      session_provider: 'claude',
      parse_mode: 'full',
      messages: [
        {
          id: 'msg-a',
          type: 'message',
          role: 'user',
          timestamp: new Date('2026-04-18T12:00:00.000Z'),
          content: 'first',
          parent_id: null
        },
        {
          id: 'msg-b',
          type: 'message',
          role: 'assistant',
          timestamp: new Date('2026-04-18T12:00:01.000Z'),
          content: 'second',
          parent_id: 'msg-a'
        }
      ],
      metadata: {}
    }

    const entries = await write_timeline(normalized_session)
    expect(entries[0].ordering).to.deep.equal({ sequence: 0, parent_id: null })
    expect(entries[1].ordering).to.deep.equal({ sequence: 1, parent_id: 'msg-a' })
  })

  it('delta re-parse produces identical ordering.sequence values for same source lines', () => {
    const entries_full = [
      {
        uuid: 'u1',
        parentUuid: null,
        timestamp: '2026-04-18T12:00:00.000Z',
        type: 'user',
        line_number: 1,
        message: { role: 'user', content: 'a' }
      },
      {
        uuid: 'u2',
        parentUuid: 'u1',
        timestamp: '2026-04-18T12:00:01.000Z',
        type: 'user',
        line_number: 2,
        message: { role: 'user', content: 'b' }
      }
    ]
    const entries_delta = [entries_full[1]]

    const full = normalize_claude_session({
      session_id: SESSION_ID,
      entries: entries_full,
      metadata: {}
    })
    const delta = normalize_claude_session({
      session_id: SESSION_ID,
      entries: entries_delta,
      metadata: {}
    })

    const full_second = full.messages.find((m) => m.ordering.source_uuid === 'u2')
    const delta_second = delta.messages.find((m) => m.ordering.source_uuid === 'u2')
    expect(full_second.ordering.sequence).to.equal(delta_second.ordering.sequence)
    expect(full_second.ordering.sequence).to.equal(2 * 10000)
  })

  it('content_index >= 10000 guard throws via compose_sub_sequence', () => {
    // Thinking sub-entries shift by 1 (slot 0 reserved for main entry), so
    // content_index = 9999 produces the forbidden sub sequence slot 10000.
    const content = []
    for (let i = 0; i < 10000; i++) {
      content.push({ type: 'thinking', content: `t${i}` })
    }
    const session = {
      session_id: SESSION_ID,
      entries: [
        {
          uuid: 'u-guard',
          parentUuid: null,
          timestamp: '2026-04-18T12:00:00.000Z',
          type: 'assistant',
          line_number: 1,
          message: { role: 'assistant', content }
        }
      ],
      metadata: {}
    }
    expect(() => normalize_claude_session(session)).to.throw(
      /content_index.*exceeds/
    )
  })
})
