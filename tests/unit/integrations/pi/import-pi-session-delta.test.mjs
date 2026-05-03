import { describe, it, beforeEach, afterEach } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

import { import_pi_sessions } from '#libs-server/integrations/pi/index.mjs'
import { import_pi_session_delta } from '#libs-server/integrations/pi/import-pi-session-delta.mjs'
import {
  load_pi_sync_state,
  clear_pi_sync_state,
  save_pi_sync_state
} from '#libs-server/integrations/pi/pi-sync-state.mjs'
import { read_timeline_jsonl_or_default } from '#libs-server/threads/timeline/timeline-jsonl.mjs'
import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'
import {
  create_temp_test_repo,
  seed_pi_thread
} from '#tests/utils/index.mjs'

const FIXTURE_MULTI = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'pi',
  'v3-multi-leaf.jsonl'
)

const copy_fixture = async (src, dest) => {
  const content = await fs.readFile(src, 'utf-8')
  await fs.writeFile(dest, content)
  return dest
}

const append_line = async (file_path, obj) => {
  await fs.appendFile(file_path, JSON.stringify(obj) + '\n')
}

const session_id_from_fixture = 'sess-v3-multi-branch-0'

describe('import_pi_session_delta', function () {
  this.timeout(20000)

  let temp_repo
  let user_base_directory
  let session_file

  beforeEach(async () => {
    temp_repo = await create_temp_test_repo({
      prefix: 'pi-delta-',
      register_directories: true
    })
    user_base_directory = temp_repo.user_path
    await fs.mkdir(path.join(user_base_directory, 'thread'), {
      recursive: true
    })
    session_file = path.join(
      os.tmpdir(),
      `pi-delta-test-${crypto.randomBytes(4).toString('hex')}.jsonl`
    )
    await copy_fixture(FIXTURE_MULTI, session_file)
  })

  afterEach(async () => {
    if (session_file) {
      await clear_pi_sync_state({ session_file })
      try {
        await fs.unlink(session_file)
      } catch {}
    }
    if (temp_repo) temp_repo.cleanup()
  })

  it('stat short-circuit: byte_offset matches file size returns no_change', async () => {
    const stat = await fs.stat(session_file)
    await save_pi_sync_state({
      session_file,
      state: {
        byte_offset: stat.size,
        leaf_id: 'b',
        branch_thread_id: 'thread-x',
        schema_version: TIMELINE_SCHEMA_VERSION
      }
    })
    const sync_state = await load_pi_sync_state({ session_file })
    const result = await import_pi_session_delta({
      session_file,
      known_thread_id: 'thread-x',
      sync_state
    })
    expect(result.no_change).to.equal(true)
    expect(result.appended).to.equal(0)
  })

  it('schema_version mismatch falls through and clears sync state', async () => {
    const stat = await fs.stat(session_file)
    await save_pi_sync_state({
      session_file,
      state: {
        byte_offset: stat.size - 1,
        leaf_id: 'b',
        branch_thread_id: 'thread-x',
        schema_version: TIMELINE_SCHEMA_VERSION - 99
      }
    })
    const sync_state = await load_pi_sync_state({ session_file })
    const result = await import_pi_session_delta({
      session_file,
      known_thread_id: 'thread-x',
      sync_state
    })
    expect(result.fall_through).to.equal(true)
    expect(result.reason).to.equal('schema_version_mismatch')
    const after = await load_pi_sync_state({ session_file })
    expect(after).to.equal(null)
  })

  it('full path persists sync state, then second tick takes delta and appends new entry', async () => {
    const thread_id = crypto.randomUUID()
    await seed_pi_thread({
      user_base_directory,
      thread_id,
      session_id: session_id_from_fixture
    })

    // First tick: no sync state -> full path, persists state
    const first = await import_pi_sessions({
      session_file,
      known_thread_id: thread_id,
      allow_updates: true,
      user_base_directory,
      bulk_import: true,
      single_leaf_only: true
    })
    expect(first.threads_updated + first.threads_created).to.be.greaterThan(0)
    const state_after_full = await load_pi_sync_state({ session_file })
    expect(state_after_full).to.not.equal(null)
    expect(state_after_full.leaf_id).to.equal('b')
    expect(state_after_full.schema_version).to.equal(TIMELINE_SCHEMA_VERSION)

    // Capture timeline length pre-append
    const thread_dir = path.join(user_base_directory, 'thread', thread_id)
    const timeline_path = path.join(thread_dir, 'timeline.jsonl')
    const before_entries = await read_timeline_jsonl_or_default({
      timeline_path,
      default_value: []
    })

    // Append a new descendant of 'b' (extends active leaf)
    await append_line(session_file, {
      id: 'c',
      parentId: 'b',
      type: 'message',
      timestamp: '2026-04-02T00:00:03.000Z',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'follow-up' }],
        timestamp: '2026-04-02T00:00:03.000Z'
      }
    })

    // Second tick: should take delta path
    const second = await import_pi_sessions({
      session_file,
      known_thread_id: thread_id,
      allow_updates: true,
      user_base_directory,
      bulk_import: true,
      single_leaf_only: true
    })
    expect(second.delta).to.equal(true)
    expect(second.appended).to.equal(1)

    const after_entries = await read_timeline_jsonl_or_default({
      timeline_path,
      default_value: []
    })
    expect(after_entries.length).to.equal(before_entries.length + 1)

    // Sync state advanced
    const state_after_delta = await load_pi_sync_state({ session_file })
    expect(state_after_delta.leaf_id).to.equal('c')
  })

  it('idempotent: a second delta tick with no file change is no-op', async () => {
    const thread_id = crypto.randomUUID()
    await seed_pi_thread({
      user_base_directory,
      thread_id,
      session_id: session_id_from_fixture
    })

    await import_pi_sessions({
      session_file,
      known_thread_id: thread_id,
      allow_updates: true,
      user_base_directory,
      bulk_import: true,
      single_leaf_only: true
    })

    await append_line(session_file, {
      id: 'c',
      parentId: 'b',
      type: 'message',
      timestamp: '2026-04-02T00:00:03.000Z',
      message: {
        role: 'user',
        content: 'x',
        timestamp: '2026-04-02T00:00:03.000Z'
      }
    })

    const first_delta = await import_pi_sessions({
      session_file,
      known_thread_id: thread_id,
      allow_updates: true,
      user_base_directory,
      bulk_import: true,
      single_leaf_only: true
    })
    expect(first_delta.appended).to.equal(1)

    const second_delta = await import_pi_sessions({
      session_file,
      known_thread_id: thread_id,
      allow_updates: true,
      user_base_directory,
      bulk_import: true,
      single_leaf_only: true
    })
    expect(second_delta.no_change).to.equal(true)
    expect(second_delta.appended).to.equal(0)
  })

  it('branch switch falls through and clears sync state', async () => {
    const thread_id = crypto.randomUUID()
    await seed_pi_thread({
      user_base_directory,
      thread_id,
      session_id: session_id_from_fixture
    })

    // Full path on multi-leaf -- active leaf is 'b' (newest timestamp).
    await import_pi_sessions({
      session_file,
      known_thread_id: thread_id,
      allow_updates: true,
      user_base_directory,
      bulk_import: true,
      single_leaf_only: true
    })
    const state = await load_pi_sync_state({ session_file })
    expect(state.leaf_id).to.equal('b')

    // Append a newer descendant of 'a' so the active leaf shifts to a sibling
    // branch ('a' subtree), making 'b' no longer present in the new active branch.
    await append_line(session_file, {
      id: 'a2',
      parentId: 'a',
      type: 'message',
      timestamp: '2026-04-02T00:00:10.000Z',
      message: {
        role: 'user',
        content: 'switch',
        timestamp: '2026-04-02T00:00:10.000Z'
      }
    })

    const sync_state = await load_pi_sync_state({ session_file })
    const result = await import_pi_session_delta({
      session_file,
      known_thread_id: thread_id,
      sync_state
    })
    expect(result.fall_through).to.equal(true)
    expect(result.reason).to.equal('branch_switch')
    const after = await load_pi_sync_state({ session_file })
    expect(after).to.equal(null)
  })

  it('aggregates after delta match aggregates from a fresh full import', async () => {
    const thread_id_a = crypto.randomUUID()
    const thread_id_b = crypto.randomUUID()
    await seed_pi_thread({
      user_base_directory,
      thread_id: thread_id_a,
      session_id: session_id_from_fixture
    })
    await seed_pi_thread({
      user_base_directory,
      thread_id: thread_id_b,
      session_id: session_id_from_fixture
    })

    // Build session_file_b for the full-only path (independent state cache key)
    const session_file_b = path.join(
      os.tmpdir(),
      `pi-delta-test-${crypto.randomBytes(4).toString('hex')}.jsonl`
    )
    await copy_fixture(FIXTURE_MULTI, session_file_b)

    try {
      // Path A: full + delta. First tick full, then append + delta.
      await import_pi_sessions({
        session_file,
        known_thread_id: thread_id_a,
        allow_updates: true,
        user_base_directory,
        bulk_import: true,
        single_leaf_only: true
      })
      await append_line(session_file, {
        id: 'c',
        parentId: 'b',
        type: 'message',
        timestamp: '2026-04-02T00:00:03.000Z',
        message: {
          role: 'assistant',
          content: 'reply',
          model: 'claude',
          provider: 'anthropic',
          usage: { input: 100, output: 50, cost: { input: 0.1, output: 0.2 } },
          timestamp: '2026-04-02T00:00:03.000Z'
        }
      })
      await import_pi_sessions({
        session_file,
        known_thread_id: thread_id_a,
        allow_updates: true,
        user_base_directory,
        bulk_import: true,
        single_leaf_only: true
      })

      // Path B: full path on the equivalent extended file (no prior state).
      await append_line(session_file_b, {
        id: 'c',
        parentId: 'b',
        type: 'message',
        timestamp: '2026-04-02T00:00:03.000Z',
        message: {
          role: 'assistant',
          content: 'reply',
          model: 'claude',
          provider: 'anthropic',
          usage: { input: 100, output: 50, cost: { input: 0.1, output: 0.2 } },
          timestamp: '2026-04-02T00:00:03.000Z'
        }
      })
      await import_pi_sessions({
        session_file: session_file_b,
        known_thread_id: thread_id_b,
        allow_updates: true,
        user_base_directory,
        bulk_import: true,
        single_leaf_only: true
      })

      const meta_a = JSON.parse(
        await fs.readFile(
          path.join(user_base_directory, 'thread', thread_id_a, 'metadata.json'),
          'utf-8'
        )
      )
      const meta_b = JSON.parse(
        await fs.readFile(
          path.join(user_base_directory, 'thread', thread_id_b, 'metadata.json'),
          'utf-8'
        )
      )

      const compare_keys = [
        'message_count',
        'tool_call_count',
        'user_message_count',
        'assistant_message_count',
        'cumulative_input_tokens',
        'cumulative_output_tokens',
        'cumulative_cache_creation_input_tokens',
        'cumulative_cache_read_input_tokens'
      ]
      for (const k of compare_keys) {
        expect(meta_a[k], `key ${k}`).to.equal(meta_b[k])
      }
    } finally {
      await clear_pi_sync_state({ session_file: session_file_b })
      try {
        await fs.unlink(session_file_b)
      } catch {}
    }
  })
})
