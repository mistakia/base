import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'

import {
  reset_all_tables,
  create_test_user,
  create_test_thread
} from '#tests/utils/index.mjs'
import { update_thread_metadata } from '#libs-server/integrations/thread/create-from-session.mjs'
import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { update_thread_state } from '#libs-server/threads/update-thread.mjs'
import { read_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'
import {
  _set_test_pre_write_hook,
  _clear_test_pre_write_hooks
} from '#libs-server/filesystem/optimistic-write.mjs'

const make_session = () => ({
  session_id: 'sess-lifecycle-preserve-001',
  session_provider: 'claude',
  parse_mode: 'full',
  messages: [
    {
      type: 'message',
      role: 'user',
      content: 'hello',
      timestamp: '2026-04-10T00:00:10.000Z',
      ordering: { sequence: 0, source_uuid: 'uuid-1' }
    },
    {
      type: 'message',
      role: 'assistant',
      content: 'hi there',
      timestamp: '2026-04-10T00:00:20.000Z',
      ordering: { sequence: 1, source_uuid: 'uuid-2' }
    }
  ],
  metadata: {
    start_time: '2026-04-10T00:00:00.000Z',
    end_time: '2026-04-10T00:01:00.000Z'
  }
})

describe('session import preserves thread lifecycle fields', function () {
  this.timeout(15000)

  let test_user

  before(async function () {
    await reset_all_tables()
    test_user = await create_test_user()
  })

  afterEach(function () {
    _clear_test_pre_write_hooks()
  })

  after(async function () {
    await reset_all_tables()
  })

  it('preserves archived lifecycle fields across an idle import', async function () {
    const test_thread = await create_test_thread({
      user_public_key: test_user.user_public_key
    })
    try {
      const metadata_path = path.join(test_thread.context_dir, 'metadata.json')
      const raw = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))
      raw.thread_state = 'archived'
      raw.archived_at = '2026-04-09T23:00:00.000Z'
      raw.archive_reason = 'completed'
      raw.tags = ['sys:tag/example.md']
      raw.workflow_base_uri = 'sys:system/workflow/test-workflow.md'
      await fs.writeFile(metadata_path, JSON.stringify(raw, null, 2))

      const changed = await update_thread_metadata(
        test_thread.context_dir,
        make_session()
      )
      expect(changed).to.equal(true)

      const after = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))
      expect(after.thread_state).to.equal('archived')
      expect(after.archived_at).to.equal('2026-04-09T23:00:00.000Z')
      expect(after.archive_reason).to.equal('completed')
      expect(after.tags).to.deep.equal(['sys:tag/example.md'])
      expect(after.workflow_base_uri).to.equal(
        'sys:system/workflow/test-workflow.md'
      )
      expect(after.source).to.be.an('object')
      expect(after.source.session_id).to.equal('sess-lifecycle-preserve-001')
      expect(after.message_count).to.equal(2)
      expect(after.updated_at).to.equal('2026-04-10T00:01:00.000Z')
    } finally {
      test_thread.cleanup()
    }
  })

  it('retries on concurrent update_thread_state and preserves archived state', async function () {
    const test_thread = await create_test_thread({
      user_public_key: test_user.user_public_key
    })
    try {
      const metadata_path = path.join(test_thread.context_dir, 'metadata.json')

      let hook_fired = 0
      const hook = async () => {
        hook_fired++
        _clear_test_pre_write_hooks()
        await update_thread_state({
          thread_id: test_thread.thread_id,
          thread_state: 'archived',
          reason: 'completed'
        })
        // Bun's fast I/O can produce identical mtimeMs across sequential
        // writes; bump mtime explicitly to guarantee the post-stat re-check
        // observes the concurrent write.
        const future = new Date(Date.now() + 1000)
        await fs.utimes(metadata_path, future, future)
      }
      _set_test_pre_write_hook(metadata_path, hook)

      const changed = await update_thread_metadata(
        test_thread.context_dir,
        make_session()
      )
      expect(changed).to.equal(true)
      expect(hook_fired).to.equal(1)

      const after = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))
      expect(after.thread_state).to.equal('archived')
      expect(after.archive_reason).to.equal('completed')
      expect(after.archived_at).to.be.a('string')
      expect(after.archived_at).to.not.equal(null)
      expect(after.source.session_id).to.equal('sess-lifecycle-preserve-001')
      expect(after.message_count).to.equal(2)
    } finally {
      test_thread.cleanup()
    }
  })

  it('full-mode timeline rebuild merges out-of-band state_change entry', async function () {
    const test_thread = await create_test_thread({
      user_public_key: test_user.user_public_key
    })
    try {
      const timeline_path = path.join(
        test_thread.context_dir,
        'timeline.jsonl'
      )

      const state_change_entry = {
        id: 'thread_state_preseeded_1',
        timestamp: '2026-04-09T23:30:00.000Z',
        type: 'system',
        system_type: 'state_change',
        content: 'active -> archived: completed',
        provider: 'base',
        provider_data: {},
        ordering: { sequence: 0, parent_id: null },
        metadata: {
          from_state: 'active',
          to_state: 'archived',
          reason: 'completed',
          thread_lifecycle: true
        },
        schema_version: 1
      }
      await fs.writeFile(
        timeline_path,
        JSON.stringify(state_change_entry) + '\n'
      )

      const result = await build_timeline_from_session(make_session(), {
        thread_dir: test_thread.context_dir,
        thread_id: test_thread.thread_id
      })
      expect(result.timeline_path).to.equal(timeline_path)

      const merged = await read_timeline_jsonl({ timeline_path })
      const state_change = merged.find(
        (e) => e.id === 'thread_state_preseeded_1'
      )
      expect(state_change, 'state_change entry preserved').to.exist
      expect(state_change.content).to.equal('active -> archived: completed')
      expect(state_change.system_type).to.equal('state_change')

      const message_entries = merged.filter((e) => e.type === 'message')
      expect(message_entries).to.have.lengthOf(2)
    } finally {
      test_thread.cleanup()
    }
  })

  it('timeline rebuild retries and preserves a concurrently appended state_change entry', async function () {
    const test_thread = await create_test_thread({
      user_public_key: test_user.user_public_key
    })
    try {
      const timeline_path = path.join(
        test_thread.context_dir,
        'timeline.jsonl'
      )
      // Seed empty timeline so build_timeline_from_session's full-mode RMW
      // path has a file to stat.
      await fs.writeFile(timeline_path, '')

      let hook_fired = 0
      const hook = async () => {
        hook_fired++
        _clear_test_pre_write_hooks()
        await update_thread_state({
          thread_id: test_thread.thread_id,
          thread_state: 'archived',
          reason: 'completed'
        })
        // update_thread_state writes to timeline.jsonl via
        // append_timeline_entry_jsonl. Force mtime advance to defeat Bun's
        // coarse mtime granularity.
        const future = new Date(Date.now() + 1000)
        await fs.utimes(timeline_path, future, future)
      }
      _set_test_pre_write_hook(timeline_path, hook)

      await build_timeline_from_session(make_session(), {
        thread_dir: test_thread.context_dir,
        thread_id: test_thread.thread_id
      })

      expect(hook_fired).to.equal(1)

      const merged = await read_timeline_jsonl({ timeline_path })
      const state_change = merged.find((e) => e.system_type === 'state_change')
      expect(state_change, 'state_change entry merged in').to.exist
      expect(state_change.content).to.match(/active -> archived/)

      const message_entries = merged.filter((e) => e.type === 'message')
      expect(message_entries).to.have.lengthOf(2)
    } finally {
      test_thread.cleanup()
    }
  })
})
