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
    results.push({ session_id: session.session_id, thread_id, thread_dir })
  }
  return results
}

const tuples = (entries) =>
  entries
    .map((e) => `${e.timestamp}|${e.id}|${JSON.stringify(e.content)}`)
    .sort()

describe('claude import idempotency (end-to-end)', function () {
  this.timeout(15000)

  let work_dir
  let session_id
  let session_file

  beforeEach(async () => {
    work_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-idem-'))
    session_id = `session-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    session_file = path.join(work_dir, `${session_id}.jsonl`)
  })

  afterEach(async () => {
    await clear_sync_state({ session_id: session_file }).catch(() => {})
    await fs.rm(work_dir, { recursive: true, force: true })
  })

  it('full -> append delta -> wipe sync-state -> re-import full yields identical timeline set', async () => {
    const initial = [
      make_entry('u1', 1),
      make_entry('u2', 2, 'assistant'),
      make_entry('u3', 3)
    ]
    const appended = [make_entry('u4', 4, 'assistant'), make_entry('u5', 5)]

    // Path A: full -> delta
    const threads_a = path.join(work_dir, 'threads-a')
    await fs.mkdir(threads_a, { recursive: true })
    await fs.writeFile(session_file, serialize(initial))
    await run_import({ session_file, threads_root: threads_a })
    await fs.appendFile(session_file, serialize(appended))
    const result_a = await run_import({ session_file, threads_root: threads_a })
    const parent_a = result_a[0]
    const entries_a = await read_timeline(parent_a.thread_dir)

    // Wipe sync-state, re-import from the full on-disk source bytes
    await clear_sync_state({ session_id: session_file })
    const threads_b = path.join(work_dir, 'threads-b')
    await fs.mkdir(threads_b, { recursive: true })
    const result_b = await run_import({ session_file, threads_root: threads_b })
    const parent_b = result_b[0]
    const entries_b = await read_timeline(parent_b.thread_dir)

    expect(entries_a.length).to.equal(entries_b.length)
    expect(tuples(entries_a)).to.deep.equal(tuples(entries_b))
  })
})
