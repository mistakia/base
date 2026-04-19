import { describe, it, beforeEach, afterEach } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { find_claude_sessions_from_filesystem } from '#libs-server/integrations/claude/claude-session-helpers.mjs'
import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'
import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { save_raw_session_data } from '#libs-server/integrations/thread/create-from-session.mjs'
import { generate_thread_id_from_session } from '#libs-server/threads/generate-thread-id-from-session.mjs'
import { clear_sync_state } from '#libs-server/integrations/claude/sync-state.mjs'
import { acquire_thread_import_lock } from '#libs-server/threads/timeline/thread-import-lock.mjs'

const make_entry = (uuid, index, type = 'user') => ({
  uuid,
  parentUuid: null,
  timestamp: `2026-04-18T12:00:${String(index).padStart(2, '0')}.000Z`,
  type,
  cwd: '/tmp/cwd',
  message:
    type === 'user'
      ? { role: 'user', content: `msg-${uuid}` }
      : {
          role: 'assistant',
          content: [{ type: 'text', text: `reply-${uuid}` }],
          model: 'claude-opus-4-7'
        }
})

const serialize = (entries) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n'

const read_timeline = async (thread_dir) => {
  const raw = await fs.readFile(path.join(thread_dir, 'timeline.jsonl'), 'utf8')
  return raw
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))
}

const run_import = async ({ session_file, threads_root }) => {
  const sessions = await find_claude_sessions_from_filesystem({ session_file })
  const results = []
  for (const session of sessions) {
    const thread_id = generate_thread_id_from_session({
      session_id: session.session_id,
      session_provider: 'claude'
    })
    const thread_dir = path.join(threads_root, thread_id)
    const raw_data_dir = path.join(thread_dir, 'raw-data')
    await fs.mkdir(raw_data_dir, { recursive: true })

    const parse_mode = session.parse_mode
    const normalized = normalize_claude_session(session)

    const lock = await acquire_thread_import_lock({ thread_dir })
    try {
      await save_raw_session_data({
        raw_data_dir,
        session_provider: 'claude',
        raw_session_data: {
          entries: [...session.entries],
          metadata: session.metadata
        },
        normalized_session: normalized
      })
      await build_timeline_from_session(normalized, { thread_id, thread_dir })
    } finally {
      await lock.release()
    }
    results.push({ session_id: session.session_id, thread_id, thread_dir, parse_mode })
  }
  return results
}

describe('claude subagent incremental import', function () {
  this.timeout(15000)

  let work_dir
  let threads_root
  let session_id
  let session_file
  const tracked_session_files = []

  beforeEach(async () => {
    work_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'subagent-incr-'))
    threads_root = path.join(work_dir, 'threads')
    await fs.mkdir(threads_root, { recursive: true })
    session_id = `session-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    session_file = path.join(work_dir, `${session_id}.jsonl`)
    tracked_session_files.length = 0
    tracked_session_files.push(path.resolve(session_file))
  })

  afterEach(async () => {
    for (const file of tracked_session_files) {
      await clear_sync_state({ session_id: file }).catch(() => {})
    }
    await fs.rm(work_dir, { recursive: true, force: true })
  })

  it('subagent delta preserves prior entries and appends new ones', async () => {
    await fs.writeFile(session_file, serialize([make_entry('p1', 1)]))
    const subagents_dir = path.join(work_dir, session_id, 'subagents')
    await fs.mkdir(subagents_dir, { recursive: true })
    const agent_file = path.join(subagents_dir, 'agent-sub-a.jsonl')
    await fs.writeFile(agent_file, serialize([make_entry('a1', 1)]))

    const first = await run_import({ session_file, threads_root })
    const agent_result = first.find((r) => r.session_id === 'agent-sub-a')
    expect(agent_result.parse_mode).to.equal('full')
    const first_agent_entries = await read_timeline(agent_result.thread_dir)
    expect(first_agent_entries.length).to.be.greaterThan(0)

    await fs.appendFile(agent_file, serialize([make_entry('a2', 2, 'assistant')]))

    const second = await run_import({ session_file, threads_root })
    const agent_delta = second.find((r) => r.session_id === 'agent-sub-a')
    expect(agent_delta.parse_mode).to.equal('delta')
    const second_agent_entries = await read_timeline(agent_result.thread_dir)
    expect(second_agent_entries.length).to.be.greaterThan(first_agent_entries.length)
    const first_ids = new Set(first_agent_entries.map((e) => e.id))
    for (const id of first_ids) {
      expect(second_agent_entries.some((e) => e.id === id)).to.equal(true)
    }
  })

  it('replaced subagent JSONL produces a timeline identical to a single full import of the replacement', async () => {
    await fs.writeFile(session_file, serialize([make_entry('p1', 1)]))
    const subagents_dir = path.join(work_dir, session_id, 'subagents')
    await fs.mkdir(subagents_dir, { recursive: true })
    const agent_file = path.join(subagents_dir, 'agent-sub-r.jsonl')
    await fs.writeFile(
      agent_file,
      serialize([make_entry('r1', 1), make_entry('r2', 2, 'assistant')])
    )

    const first = await run_import({ session_file, threads_root })
    const agent_first = first.find((r) => r.session_id === 'agent-sub-r')
    const agent_thread_dir = agent_first.thread_dir

    // Replace the subagent file with smaller contents so size < stored offset
    // triggers the replacement-detection branch.
    const replacement_entries = [make_entry('n1', 1)]
    await fs.writeFile(agent_file, serialize(replacement_entries))

    const second = await run_import({ session_file, threads_root })
    const agent_second = second.find((r) => r.session_id === 'agent-sub-r')
    expect(agent_second.parse_mode).to.equal('full')
    const rebuilt_entries = await read_timeline(agent_thread_dir)

    // Compare against a single full import of the same replacement content
    const fresh_threads_root = path.join(work_dir, 'threads-fresh')
    await fs.mkdir(fresh_threads_root, { recursive: true })
    const fresh_session_id = `session-fresh-${Date.now()}`
    const fresh_session_file = path.join(work_dir, `${fresh_session_id}.jsonl`)
    tracked_session_files.push(path.resolve(fresh_session_file))
    await fs.writeFile(fresh_session_file, serialize([make_entry('p1', 1)]))
    const fresh_sub_dir = path.join(work_dir, fresh_session_id, 'subagents')
    await fs.mkdir(fresh_sub_dir, { recursive: true })
    const fresh_agent_file = path.join(fresh_sub_dir, 'agent-sub-r.jsonl')
    await fs.writeFile(fresh_agent_file, serialize(replacement_entries))

    const fresh = await run_import({
      session_file: fresh_session_file,
      threads_root: fresh_threads_root
    })
    const fresh_agent = fresh.find((r) => r.session_id === 'agent-sub-r')
    const fresh_entries = await read_timeline(fresh_agent.thread_dir)

    const tuples = (entries) =>
      entries
        .map((e) => `${e.timestamp}|${e.id}|${JSON.stringify(e.content)}`)
        .sort()
    expect(tuples(rebuilt_entries)).to.deep.equal(tuples(fresh_entries))
  })

  it('new subagent appearing on incremental run gets a full timeline', async () => {
    await fs.writeFile(session_file, serialize([make_entry('p1', 1)]))
    const first = await run_import({ session_file, threads_root })
    expect(first).to.have.lengthOf(1)

    const subagents_dir = path.join(work_dir, session_id, 'subagents')
    await fs.mkdir(subagents_dir, { recursive: true })
    const agent_file = path.join(subagents_dir, 'agent-sub-late.jsonl')
    await fs.writeFile(
      agent_file,
      serialize([make_entry('la1', 1), make_entry('la2', 2, 'assistant')])
    )

    const second = await run_import({ session_file, threads_root })
    const new_agent = second.find((r) => r.session_id === 'agent-sub-late')
    expect(new_agent, 'new subagent returned').to.exist
    expect(new_agent.parse_mode).to.equal('full')
    const entries = await read_timeline(new_agent.thread_dir)
    expect(entries.length).to.be.greaterThan(0)
  })
})
