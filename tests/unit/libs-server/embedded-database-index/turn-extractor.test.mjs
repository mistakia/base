import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { extract_turns_from_timeline } from '#libs-server/embedded-database-index/sync/turn-extractor.mjs'

async function write_jsonl(file_path, entries) {
  const body = entries.map((entry) => JSON.stringify(entry)).join('\n')
  await fs.writeFile(file_path, body + '\n')
}

describe('extract_turns_from_timeline', function () {
  this.timeout(5000)

  let temp_dir
  let timeline_path

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'turn-extractor-test-'))
    timeline_path = path.join(temp_dir, 'timeline.jsonl')
  })

  afterEach(async () => {
    if (temp_dir) await fs.rm(temp_dir, { recursive: true, force: true })
  })

  it('returns an empty array when no timeline exists', async () => {
    const result = await extract_turns_from_timeline({
      thread_id: 't1',
      timeline_path: path.join(temp_dir, 'missing.jsonl')
    })
    expect(result).to.deep.equal([])
  })

  it('emits one turn per non-meta user message, aggregating assistant replies and Bash commands', async () => {
    await write_jsonl(timeline_path, [
      {
        type: 'message',
        role: 'user',
        content: 'how do I run the tests?',
        timestamp: '2026-04-01T00:00:00Z'
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'use bun test:unit' }],
        timestamp: '2026-04-01T00:00:01Z'
      },
      {
        type: 'tool_call',
        tool_name: 'Bash',
        tool_input: { command: 'bun test:unit' },
        timestamp: '2026-04-01T00:00:02Z'
      },
      {
        type: 'tool_result',
        tool_name: 'Bash',
        content: 'ignored',
        timestamp: '2026-04-01T00:00:03Z'
      },
      {
        type: 'message',
        role: 'user',
        content: 'what about integration?',
        timestamp: '2026-04-01T00:05:00Z'
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'run bun test:integration',
        timestamp: '2026-04-01T00:05:01Z'
      }
    ])

    const turns = await extract_turns_from_timeline({
      thread_id: 't1',
      timeline_path
    })

    expect(turns).to.have.lengthOf(2)
    expect(turns[0].turn_index).to.equal(0)
    expect(turns[0].first_timestamp).to.equal('2026-04-01T00:00:00Z')
    expect(turns[0].turn_text).to.include('how do I run the tests?')
    expect(turns[0].turn_text).to.include('use bun test:unit')
    expect(turns[0].turn_text).to.include('bun test:unit')
    expect(turns[0].turn_text).to.not.include('ignored')

    expect(turns[1].turn_index).to.equal(1)
    expect(turns[1].turn_text).to.include('what about integration?')
    expect(turns[1].turn_text).to.include('run bun test:integration')
  })

  it('skips meta and warmup user messages but preserves turn_index continuity across real turns', async () => {
    await write_jsonl(timeline_path, [
      {
        type: 'message',
        role: 'user',
        content: 'warmup',
        timestamp: '2026-04-01T00:00:00Z'
      },
      {
        type: 'message',
        role: 'user',
        content: '<command-name>/foo</command-name> x',
        metadata: { is_meta: true },
        timestamp: '2026-04-01T00:00:01Z'
      },
      {
        type: 'message',
        role: 'user',
        content: 'real question',
        timestamp: '2026-04-01T00:00:02Z'
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'real answer',
        timestamp: '2026-04-01T00:00:03Z'
      }
    ])

    const turns = await extract_turns_from_timeline({
      thread_id: 't2',
      timeline_path
    })

    expect(turns).to.have.lengthOf(1)
    expect(turns[0].turn_text).to.include('real question')
    expect(turns[0].turn_text).to.include('real answer')
  })

  it('drops assistant-only segments with no preceding user turn', async () => {
    await write_jsonl(timeline_path, [
      {
        type: 'message',
        role: 'assistant',
        content: 'orphan',
        timestamp: '2026-04-01T00:00:00Z'
      },
      {
        type: 'tool_call',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        timestamp: '2026-04-01T00:00:01Z'
      }
    ])

    const turns = await extract_turns_from_timeline({
      thread_id: 't3',
      timeline_path
    })
    expect(turns).to.deep.equal([])
  })
})
