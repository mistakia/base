import { describe, it } from 'mocha'
import { expect } from 'chai'
import path from 'path'
import fs from 'fs/promises'

import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'
import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { create_temp_test_directory } from '#tests/utils/create-temp-test-directory.mjs'
import { read_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'

describe('Claude Interrupt Message Timeline Integration', () => {
  it('should create timeline entries with system type for interrupt messages', async () => {
    const temp_dir_obj = create_temp_test_directory()
    const thread_dir = path.join(temp_dir_obj.path, 'test-thread')
    await fs.mkdir(thread_dir, { recursive: true })

    // Create a Claude session with an interrupt message
    const claude_session = {
      session_id: 'test-interrupt-session',
      entries: [
        {
          uuid: 'user-message-1',
          timestamp: '2025-07-26T16:48:00.000Z',
          type: 'user',
          message: {
            role: 'user',
            content: 'Help me with this task'
          },
          line_number: 1
        },
        {
          uuid: 'interrupt-message-1',
          timestamp: '2025-07-26T16:48:09.704Z',
          type: 'user',
          message: {
            role: 'user',
            content: '[Request interrupted by user]'
          },
          cwd: '/Users/test/project',
          userType: 'external',
          gitBranch: 'feature/test',
          line_number: 2
        },
        {
          uuid: 'assistant-response-1',
          timestamp: '2025-07-26T16:48:10.000Z',
          type: 'assistant',
          message: {
            role: 'assistant',
            content: 'I understand you wanted help.'
          },
          line_number: 3
        }
      ],
      metadata: {
        cwd: '/Users/test/project',
        version: '1.0.61',
        user_type: 'external'
      }
    }

    // Normalize the session
    const normalized_session = normalize_claude_session(claude_session)
    normalized_session.parse_mode = 'full'

    // Verify normalization
    expect(normalized_session.messages).to.have.length(3)

    const interrupt_message = normalized_session.messages.find(
      (m) => m.id === 'interrupt-message-1'
    )
    expect(interrupt_message).to.exist
    expect(interrupt_message.type).to.equal('system')
    expect(interrupt_message.content).to.equal('Request interrupted by user')
    expect(interrupt_message.system_type).to.equal('status')
    expect(interrupt_message.metadata.is_interrupt).to.be.true

    // Build timeline from normalized session
    const thread_info = {
      thread_id: 'test-thread-id',
      thread_dir
    }

    const timeline_result = await build_timeline_from_session(
      normalized_session,
      thread_info
    )

    // Verify timeline creation
    expect(timeline_result.entry_count).to.equal(3)

    // Read the created timeline file (JSONL format)
    const timeline_entries = await read_timeline_jsonl({
      timeline_path: timeline_result.timeline_path
    })

    // Find the interrupt message in the timeline
    const interrupt_timeline_entry = timeline_entries.find(
      (entry) => entry.provider_data.session_index === 1 // Second entry in the session
    )

    expect(interrupt_timeline_entry).to.exist
    expect(interrupt_timeline_entry.type).to.equal('system')
    expect(interrupt_timeline_entry.content).to.equal(
      'Request interrupted by user'
    )
    expect(interrupt_timeline_entry.system_type).to.equal('status')
    expect(interrupt_timeline_entry.metadata.is_interrupt).to.be.true
    expect(interrupt_timeline_entry.metadata.original_type).to.equal('user')
    expect(interrupt_timeline_entry.metadata.working_directory).to.equal(
      '/Users/test/project'
    )
    expect(interrupt_timeline_entry.metadata.git_branch).to.equal(
      'feature/test'
    )

    // Verify timeline entry conforms to schema structure
    expect(interrupt_timeline_entry).to.have.property('id')
    expect(interrupt_timeline_entry).to.have.property('timestamp')
    expect(interrupt_timeline_entry).to.have.property('provider', 'claude')
    expect(interrupt_timeline_entry).to.have.property('ordering')
    expect(interrupt_timeline_entry.ordering).to.have.property('sequence')
    // Composite sequence: line_number * 10000 for main-message entries.
    expect(interrupt_timeline_entry.ordering.sequence).to.equal(2 * 10000)

    // Clean up
    temp_dir_obj.cleanup()
  })

  it('should maintain correct timeline ordering with mixed message types', async () => {
    const temp_dir_obj = create_temp_test_directory()
    const thread_dir = path.join(temp_dir_obj.path, 'test-thread-mixed')
    await fs.mkdir(thread_dir, { recursive: true })

    // Create a session with mixed message types including interrupts
    const claude_session = {
      session_id: 'test-mixed-session',
      entries: [
        {
          uuid: 'user-1',
          timestamp: '2025-07-26T16:48:00.000Z',
          type: 'user',
          message: { role: 'user', content: 'First message' },
          line_number: 1
        },
        {
          uuid: 'interrupt-1',
          timestamp: '2025-07-26T16:48:01.000Z',
          type: 'user',
          message: { role: 'user', content: '[Request interrupted by user]' },
          line_number: 2
        },
        {
          uuid: 'assistant-1',
          timestamp: '2025-07-26T16:48:02.000Z',
          type: 'assistant',
          message: { role: 'assistant', content: 'Response to first' },
          line_number: 3
        },
        {
          uuid: 'user-2',
          timestamp: '2025-07-26T16:48:03.000Z',
          type: 'user',
          message: { role: 'user', content: 'Second user message' },
          line_number: 4
        },
        {
          uuid: 'interrupt-2',
          timestamp: '2025-07-26T16:48:04.000Z',
          type: 'user',
          message: {
            role: 'user',
            content: '  [Request interrupted by user]  '
          },
          line_number: 5
        }
      ],
      metadata: {
        cwd: '/test/dir',
        version: '1.0.0'
      }
    }

    const normalized_session = normalize_claude_session(claude_session)
    normalized_session.parse_mode = 'full'
    const thread_info = { thread_id: 'mixed-test', thread_dir }

    const timeline_result = await build_timeline_from_session(
      normalized_session,
      thread_info
    )

    // Read the created timeline file (JSONL format)
    const timeline_entries = await read_timeline_jsonl({
      timeline_path: timeline_result.timeline_path
    })

    // Verify ordering is maintained
    expect(timeline_entries).to.have.length(5)

    // Composite sequence: line_number * 10000 for main-message entries.
    timeline_entries.forEach((entry, index) => {
      expect(entry.ordering.sequence).to.equal((index + 1) * 10000)
    })

    // Check that interrupts are properly classified as system messages
    const interrupt_entries = timeline_entries.filter(
      (entry) => entry.metadata?.is_interrupt
    )
    expect(interrupt_entries).to.have.length(2)

    interrupt_entries.forEach((entry) => {
      expect(entry.type).to.equal('system')
      expect(entry.content).to.equal('Request interrupted by user')
      expect(entry.system_type).to.equal('status')
    })

    // Verify non-interrupt messages remain as regular messages
    const regular_messages = timeline_entries.filter(
      (entry) => entry.type === 'message'
    )
    expect(regular_messages).to.have.length(3)

    // Clean up
    temp_dir_obj.cleanup()
  })
})
