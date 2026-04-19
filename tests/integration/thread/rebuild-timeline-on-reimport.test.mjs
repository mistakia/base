import { describe, it } from 'mocha'
import { expect } from 'chai'
import path from 'path'
import fs from 'fs/promises'

import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'
import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { create_temp_test_directory } from '#tests/utils/create-temp-test-directory.mjs'
import { read_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'
import { seed_thread_metadata } from '#tests/utils/index.mjs'

// Lock in Component 1 of user:task/base/fix-thread-relation-pipeline-reliability.md:
// re-importing a session with additional raw-data entries must produce a
// timeline that contains the additional entries. The previous
// `merge_with_existing_timeline` path dropped late-session entries.
describe('build_timeline_from_session re-import rebuild', () => {
  it('should include entries added on re-import of the same session', async () => {
    const temp_dir_obj = create_temp_test_directory()
    const thread_dir = path.join(temp_dir_obj.path, 'reimport-thread')
    await fs.mkdir(thread_dir, { recursive: true })
    await seed_thread_metadata({ thread_dir, thread_id: 'reimport-thread' })

    const base_entries = [
      {
        uuid: 'user-1',
        timestamp: '2025-07-26T16:48:00.000Z',
        type: 'user',
        message: { role: 'user', content: 'first' },
        line_number: 1
      },
      {
        uuid: 'assistant-1',
        timestamp: '2025-07-26T16:48:01.000Z',
        type: 'assistant',
        message: { role: 'assistant', content: 'first response' },
        line_number: 2
      }
    ]

    const first_session = {
      session_id: 'reimport-session',
      entries: base_entries,
      metadata: { cwd: '/tmp', version: '1.0.0' }
    }

    const thread_info = { thread_id: 'reimport-thread', thread_dir }

    const first_normalized = normalize_claude_session(first_session)
    first_normalized.parse_mode = 'full'
    const first_result = await build_timeline_from_session(
      first_normalized,
      thread_info
    )
    expect(first_result.entry_count).to.equal(2)

    const first_timeline = await read_timeline_jsonl({
      timeline_path: first_result.timeline_path
    })
    expect(first_timeline).to.have.length(2)

    // Re-import the same session with one additional entry appended.
    const extended_session = {
      session_id: 'reimport-session',
      entries: [
        ...base_entries,
        {
          uuid: 'user-2',
          timestamp: '2025-07-26T16:48:02.000Z',
          type: 'user',
          message: { role: 'user', content: 'second' },
          line_number: 3
        }
      ],
      metadata: { cwd: '/tmp', version: '1.0.0' }
    }

    const second_normalized = normalize_claude_session(extended_session)
    second_normalized.parse_mode = 'full'
    const second_result = await build_timeline_from_session(
      second_normalized,
      thread_info
    )

    expect(second_result.entry_count).to.equal(3)
    expect(second_result.timeline_modified).to.be.true

    const second_timeline = await read_timeline_jsonl({
      timeline_path: second_result.timeline_path
    })
    expect(second_timeline).to.have.length(3)
    const contents = second_timeline.map((entry) => entry.content)
    expect(contents).to.include('second')

    temp_dir_obj.cleanup()
  })
})
