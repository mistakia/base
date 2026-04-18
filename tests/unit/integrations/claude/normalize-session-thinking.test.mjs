import { describe, it } from 'mocha'
import { expect } from 'chai'

import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'

describe('Claude Session Thinking Block Extraction', () => {
  describe('thinking block separation', () => {
    it('should extract thinking blocks as separate timeline entries', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: '0d81a95e-29d9-4567-976b-9dbbaab3edc2',
            timestamp: '2025-08-04T01:50:53.239Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              model: 'claude-opus-4-20250514',
              content: [
                {
                  type: 'thinking',
                  content:
                    'The user wants to make the timeline cleaner and more concise.'
                },
                {
                  type: 'text',
                  text: 'I can help you make the timeline cleaner.'
                }
              ]
            },
            line_number: 38
          }
        ],
        metadata: {
          cwd: '/test/dir',
          version: '1.0.0'
        }
      }

      const result = normalize_claude_session(claude_session)

      // Should have both main message and thinking entry
      expect(result.messages).to.have.length(2)

      // Find the main message and thinking entry
      const mainMessage = result.messages.find(
        (m) => m.id === '0d81a95e-29d9-4567-976b-9dbbaab3edc2'
      )
      const thinkingEntry = result.messages.find(
        (m) => m.id === '0d81a95e-29d9-4567-976b-9dbbaab3edc2-thinking-0'
      )

      // Verify main message exists and has correct content
      expect(mainMessage).to.exist
      expect(mainMessage.type).to.equal('message')
      expect(mainMessage.role).to.equal('assistant')
      expect(mainMessage.content).to.deep.equal([
        'I can help you make the timeline cleaner.'
      ])

      // Verify thinking entry exists and has correct content
      expect(thinkingEntry).to.exist
      expect(thinkingEntry.type).to.equal('thinking')
      expect(thinkingEntry.content).to.equal(
        'The user wants to make the timeline cleaner and more concise.'
      )
      expect(thinkingEntry.thinking_type).to.equal('reasoning')
      expect(thinkingEntry.ordering.parent_id).to.equal(
        '0d81a95e-29d9-4567-976b-9dbbaab3edc2'
      )
    })

    it('should handle multiple thinking blocks in one message', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-message-uuid',
            timestamp: '2025-08-04T01:50:53.239Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  content: 'First thought process'
                },
                {
                  type: 'text',
                  text: 'Main response text'
                },
                {
                  type: 'thinking.signature',
                  content: 'Analysis of the situation'
                }
              ]
            },
            line_number: 1
          }
        ],
        metadata: {
          cwd: '/test/dir',
          version: '1.0.0'
        }
      }

      const result = normalize_claude_session(claude_session)

      // Should have main message + 2 thinking entries
      expect(result.messages).to.have.length(3)

      const mainMessage = result.messages.find(
        (m) => m.id === 'test-message-uuid'
      )
      const thinking1 = result.messages.find(
        (m) => m.id === 'test-message-uuid-thinking-0'
      )
      const thinking2 = result.messages.find(
        (m) => m.id === 'test-message-uuid-thinking-2'
      )

      // Main message should only have text content
      expect(mainMessage.content).to.deep.equal(['Main response text'])

      // First thinking block
      expect(thinking1).to.exist
      expect(thinking1.content).to.equal('First thought process')
      expect(thinking1.thinking_type).to.equal('reasoning')

      // Second thinking block (with signature type)
      expect(thinking2).to.exist
      expect(thinking2.content).to.equal('Analysis of the situation')
      expect(thinking2.thinking_type).to.equal('analysis')
    })

    it('should handle different thinking content formats', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-message-uuid',
            timestamp: '2025-08-04T01:50:53.239Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking.thinking',
                  text: 'Content in text field'
                },
                {
                  type: 'thinking',
                  thinking: 'Content in thinking field'
                },
                {
                  type: 'text',
                  text: 'Regular text response'
                }
              ]
            },
            line_number: 1
          }
        ],
        metadata: {
          cwd: '/test/dir',
          version: '1.0.0'
        }
      }

      const result = normalize_claude_session(claude_session)

      expect(result.messages).to.have.length(3)

      const thinking1 = result.messages.find(
        (m) => m.id === 'test-message-uuid-thinking-0'
      )
      const thinking2 = result.messages.find(
        (m) => m.id === 'test-message-uuid-thinking-1'
      )

      expect(thinking1.content).to.equal('Content in text field')
      expect(thinking2.content).to.equal('Content in thinking field')
    })

    it('should preserve thinking block metadata', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-message-uuid',
            timestamp: '2025-08-04T01:50:53.239Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  content: 'Test thinking',
                  metadata: {
                    custom_field: 'custom_value'
                  }
                }
              ]
            },
            line_number: 15,
            gitBranch: 'feature/test'
          }
        ],
        metadata: {
          cwd: '/test/dir',
          version: '1.0.0'
        }
      }

      const result = normalize_claude_session(claude_session)

      const thinkingEntry = result.messages.find((m) => m.type === 'thinking')

      expect(thinkingEntry.metadata.original_content_type).to.equal('thinking')
      expect(thinkingEntry.metadata.custom_field).to.equal('custom_value')
      expect(thinkingEntry.provider_data.line_number).to.equal(15)
      expect(thinkingEntry.provider_data.content_block_index).to.equal(0)
      expect(thinkingEntry.provider_data.is_thinking_block).to.be.true
    })
  })

  describe('thinking block filtering from main message', () => {
    it('should not include thinking content in main message when extracted as separate entries', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-message-uuid',
            timestamp: '2025-08-04T01:50:53.239Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  content: 'This should not appear in main message'
                },
                {
                  type: 'text',
                  text: 'This should appear in main message'
                },
                {
                  type: 'thinking.signature',
                  content: 'This should also not appear in main message'
                }
              ]
            },
            line_number: 1
          }
        ],
        metadata: {
          cwd: '/test/dir',
          version: '1.0.0'
        }
      }

      const result = normalize_claude_session(claude_session)

      const mainMessage = result.messages.find(
        (m) => m.id === 'test-message-uuid'
      )

      // Main message should only contain the text content, not thinking blocks
      expect(mainMessage.content).to.deep.equal([
        'This should appear in main message'
      ])

      // Verify no thinking objects are in the main message content
      const hasThinkingInContent =
        Array.isArray(mainMessage.content) &&
        mainMessage.content.some(
          (item) =>
            typeof item === 'object' &&
            item.type &&
            item.type.startsWith('thinking')
        )

      expect(hasThinkingInContent).to.be.false
    })

    it('should handle message with only thinking blocks', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-message-uuid',
            timestamp: '2025-08-04T01:50:53.239Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  content: 'Only thinking content here'
                }
              ]
            },
            line_number: 1
          }
        ],
        metadata: {
          cwd: '/test/dir',
          version: '1.0.0'
        }
      }

      const result = normalize_claude_session(claude_session)

      // Should only have the thinking entry, main message should be filtered out due to empty content
      expect(result.messages).to.have.length(1)

      const thinkingEntry = result.messages.find((m) => m.type === 'thinking')
      const mainMessage = result.messages.find(
        (m) => m.id === 'test-message-uuid'
      )

      expect(thinkingEntry).to.exist
      expect(mainMessage).to.not.exist // Should be filtered out due to empty content
    })
  })

  describe('sequence and ordering', () => {
    it('should maintain correct sequence order for thinking entries', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'msg1',
            timestamp: '2025-08-04T01:50:53.239Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  content: 'First thinking'
                },
                {
                  type: 'text',
                  text: 'First response'
                }
              ]
            },
            line_number: 1
          },
          {
            uuid: 'msg2',
            timestamp: '2025-08-04T01:51:00.000Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  content: 'Second thinking'
                },
                {
                  type: 'text',
                  text: 'Second response'
                }
              ]
            },
            line_number: 2
          }
        ],
        metadata: {
          cwd: '/test/dir',
          version: '1.0.0'
        }
      }

      const result = normalize_claude_session(claude_session)

      // Should have 4 entries: 2 main messages + 2 thinking entries
      expect(result.messages).to.have.length(4)

      // Composite source-intrinsic sequence = line_number * 10000 + block_offset.
      // Main message entries use block 0; sub-entries (thinking) use block 1+.
      const sequences = result.messages
        .map((m) => m.ordering.sequence)
        .sort((a, b) => a - b)
      expect(sequences).to.deep.equal([10000, 10001, 20000, 20001])

      // Verify thinking entries have correct parent relationships
      const thinking1 = result.messages.find((m) => m.id === 'msg1-thinking-0')
      const thinking2 = result.messages.find((m) => m.id === 'msg2-thinking-0')

      expect(thinking1.ordering.parent_id).to.equal('msg1')
      expect(thinking2.ordering.parent_id).to.equal('msg2')
    })
  })

  describe('edge cases', () => {
    it('should handle thinking blocks with missing content gracefully', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-message-uuid',
            timestamp: '2025-08-04T01:50:53.239Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking'
                  // Missing content/text/thinking field
                },
                {
                  type: 'text',
                  text: 'Regular text'
                }
              ]
            },
            line_number: 1
          }
        ],
        metadata: {
          cwd: '/test/dir',
          version: '1.0.0'
        }
      }

      const result = normalize_claude_session(claude_session)

      const thinkingEntry = result.messages.find((m) => m.type === 'thinking')

      expect(thinkingEntry).to.exist
      expect(thinkingEntry.content).to.be.undefined // Should be undefined when no content fields present
    })

    it('should handle mixed content with thinking blocks correctly', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-message-uuid',
            timestamp: '2025-08-04T01:50:53.239Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'First text'
                },
                {
                  type: 'thinking',
                  content: 'Thinking content'
                },
                {
                  type: 'text',
                  text: 'Second text'
                },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    data: 'image-data'
                  }
                }
              ]
            },
            line_number: 1
          }
        ],
        metadata: {
          cwd: '/test/dir',
          version: '1.0.0'
        }
      }

      const result = normalize_claude_session(claude_session)

      expect(result.messages).to.have.length(2) // Main message + thinking entry

      const mainMessage = result.messages.find(
        (m) => m.id === 'test-message-uuid'
      )
      const thinkingEntry = result.messages.find((m) => m.type === 'thinking')

      // Main message should have text and image content, but not thinking
      expect(mainMessage.content).to.have.length(3) // First text, Second text, image
      expect(mainMessage.content[0]).to.equal('First text')
      expect(mainMessage.content[1]).to.equal('Second text')
      expect(mainMessage.content[2]).to.be.an('object') // Image content

      // Thinking entry should exist separately
      expect(thinkingEntry.content).to.equal('Thinking content')
    })
  })
})
