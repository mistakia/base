/* global describe, it */

import { expect } from 'chai'

import {
  format_thread,
  format_thread_status,
  format_timeline_entry
} from '#cli/base/lib/format.mjs'

describe('thread-commands', () => {
  describe('format_thread', () => {
    it('should format thread as tab-separated by default', () => {
      const thread = {
        thread_id: 'abc-123',
        thread_state: 'active',
        title: 'Test Thread'
      }

      const result = format_thread(thread)

      expect(result).to.equal('abc-123\tactive\tTest Thread')
    })

    it('should handle missing fields gracefully', () => {
      const thread = {
        thread_id: 'abc-123'
      }

      const result = format_thread(thread)

      expect(result).to.equal('abc-123\t\t')
    })

    it('should format verbose output with multiple lines', () => {
      const thread = {
        thread_id: 'abc-123',
        thread_state: 'active',
        title: 'Test Thread',
        created_at: '2026-02-08T10:00:00.000Z',
        updated_at: '2026-02-08T12:00:00.000Z',
        relations: [{ type: 'modifies' }, { type: 'accesses' }]
      }

      const result = format_thread(thread, { verbose: true })

      expect(result).to.include('abc-123')
      expect(result).to.include('Title: Test Thread')
      expect(result).to.include('State: active')
      expect(result).to.include('Created:')
      expect(result).to.include('Updated:')
      expect(result).to.include('Relations: 2')
    })

    it('should include timeline count when timeline is present', () => {
      const thread = {
        thread_id: 'abc-123',
        timeline: [{ type: 'message' }, { type: 'tool_call' }]
      }

      const result = format_thread(thread, { verbose: true })

      expect(result).to.include('Timeline entries: 2')
    })
  })

  describe('format_thread_status', () => {
    it('should format thread status with header', () => {
      const status = {
        thread_id: 'abc-123',
        title: 'Test Thread',
        thread_state: 'active'
      }

      const result = format_thread_status(status)

      expect(result).to.include('Thread: abc-123')
      expect(result).to.include('Title: Test Thread')
      expect(result).to.include('State: active')
    })

    it('should format first user message', () => {
      const status = {
        thread_id: 'abc-123',
        first_user_message: {
          content: 'Please help me with this task',
          timestamp: '2026-02-08T10:00:00.000Z'
        }
      }

      const result = format_thread_status(status)

      expect(result).to.include('Initial Request')
      expect(result).to.include('Please help me with this task')
    })

    it('should format message with content array', () => {
      const status = {
        thread_id: 'abc-123',
        first_user_message: {
          content: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' }
          ],
          timestamp: '2026-02-08T10:00:00.000Z'
        }
      }

      const result = format_thread_status(status)

      expect(result).to.include('First part')
      expect(result).to.include('Second part')
    })

    it('should truncate long content', () => {
      const long_content = 'x'.repeat(600)
      const status = {
        thread_id: 'abc-123',
        first_user_message: {
          content: long_content,
          timestamp: '2026-02-08T10:00:00.000Z'
        }
      }

      const result = format_thread_status(status, { max_length: 500 })

      expect(result.length).to.be.lessThan(long_content.length + 200)
      expect(result).to.include('...')
    })

    it('should include tool counts when present', () => {
      const status = {
        thread_id: 'abc-123',
        tool_counts: {
          Read: 10,
          Edit: 5,
          Bash: 3
        }
      }

      const result = format_thread_status(status)

      expect(result).to.include('Tool Usage:')
      expect(result).to.include('Read: 10')
      expect(result).to.include('Edit: 5')
      expect(result).to.include('Bash: 3')
    })

    it('should sort tool counts by frequency', () => {
      const status = {
        thread_id: 'abc-123',
        tool_counts: {
          Bash: 3,
          Read: 10,
          Edit: 5
        }
      }

      const result = format_thread_status(status)
      const read_pos = result.indexOf('Read: 10')
      const edit_pos = result.indexOf('Edit: 5')
      const bash_pos = result.indexOf('Bash: 3')

      expect(read_pos).to.be.lessThan(edit_pos)
      expect(edit_pos).to.be.lessThan(bash_pos)
    })

    it('should include relations when present', () => {
      const status = {
        thread_id: 'abc-123',
        relations: [
          { relation_type: 'modifies', target_uri: 'user:file1.md' },
          { relation_type: 'accesses', target_uri: 'user:file2.md' }
        ]
      }

      const result = format_thread_status(status)

      expect(result).to.include('Relations (2):')
      expect(result).to.include('modifies')
      expect(result).to.include('user:file1.md')
    })
  })

  describe('format_timeline_entry', () => {
    it('should format message entry as tab-separated by default', () => {
      const entry = {
        type: 'message',
        role: 'user',
        content: 'Hello world',
        timestamp: '2026-02-08T10:00:00.000Z'
      }

      const result = format_timeline_entry(entry)

      expect(result).to.include('2026-02-08 10:00:00')
      expect(result).to.include('message:user')
      expect(result).to.include('Hello world')
    })

    it('should format tool_call entry with tool name', () => {
      const entry = {
        type: 'tool_call',
        tool_name: 'Read',
        timestamp: '2026-02-08T10:00:00.000Z'
      }

      const result = format_timeline_entry(entry)

      expect(result).to.include('tool:Read')
    })

    it('should truncate long content in default mode', () => {
      const entry = {
        type: 'message',
        role: 'assistant',
        content: 'x'.repeat(200),
        timestamp: '2026-02-08T10:00:00.000Z'
      }

      const result = format_timeline_entry(entry)

      expect(result.length).to.be.lessThan(200)
      expect(result).to.include('...')
    })

    it('should format verbose message output', () => {
      const entry = {
        type: 'message',
        role: 'user',
        content: 'Hello world',
        timestamp: '2026-02-08T10:00:00.000Z'
      }

      const result = format_timeline_entry(entry, { verbose: true })

      expect(result).to.include('Type: message')
      expect(result).to.include('Role: user')
      expect(result).to.include('Content:')
      expect(result).to.include('Hello world')
    })

    it('should format verbose tool_call output', () => {
      const entry = {
        type: 'tool_call',
        tool_name: 'Edit',
        tool_call_id: 'call_123',
        timestamp: '2026-02-08T10:00:00.000Z'
      }

      const result = format_timeline_entry(entry, { verbose: true })

      expect(result).to.include('Type: tool_call')
      expect(result).to.include('Tool: Edit')
      expect(result).to.include('Call ID: call_123')
    })

    it('should format verbose tool_result output', () => {
      const entry = {
        type: 'tool_result',
        tool_call_id: 'call_123',
        is_error: true,
        timestamp: '2026-02-08T10:00:00.000Z'
      }

      const result = format_timeline_entry(entry, { verbose: true })

      expect(result).to.include('Type: tool_result')
      expect(result).to.include('Call ID: call_123')
      expect(result).to.include('Error: true')
    })

    it('should format thinking entry', () => {
      const entry = {
        type: 'thinking',
        thinking: 'Let me think about this...',
        timestamp: '2026-02-08T10:00:00.000Z'
      }

      const result = format_timeline_entry(entry, { verbose: true })

      expect(result).to.include('Type: thinking')
      expect(result).to.include('Let me think')
    })

    it('should handle unknown entry types', () => {
      const entry = {
        type: 'custom_type',
        timestamp: '2026-02-08T10:00:00.000Z'
      }

      const result = format_timeline_entry(entry, { verbose: true })

      expect(result).to.include('Type: custom_type')
    })

    it('should handle content array format', () => {
      const entry = {
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: 'Array content' }],
        timestamp: '2026-02-08T10:00:00.000Z'
      }

      const result = format_timeline_entry(entry)

      expect(result).to.include('Array content')
    })

    it('should replace newlines with spaces in default mode', () => {
      const entry = {
        type: 'message',
        role: 'user',
        content: 'Line 1\nLine 2\nLine 3',
        timestamp: '2026-02-08T10:00:00.000Z'
      }

      const result = format_timeline_entry(entry)

      expect(result).to.not.include('\n')
    })
  })
})
