import { describe, it } from 'mocha'
import { expect } from 'chai'

import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'

describe('Claude Session Interrupt Message Normalization', () => {
  describe('interrupt message detection', () => {
    it('should detect exact interrupt pattern in string content', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-uuid-1',
            timestamp: '2025-07-26T16:48:09.704Z',
            type: 'user',
            message: {
              role: 'user',
              content: '[Request interrupted by user]'
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

      expect(result.messages).to.have.length(1)
      const message = result.messages[0]

      expect(message.type).to.equal('system')
      expect(message.content).to.equal('Request interrupted by user')
      expect(message.system_type).to.equal('status')
      expect(message.metadata.original_type).to.equal('user')
      expect(message.metadata.is_interrupt).to.be.true
      expect(message.metadata.original_content).to.equal(
        '[Request interrupted by user]'
      )
    })

    it('should detect interrupt pattern in array content with text item', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-uuid-1',
            timestamp: '2025-07-26T16:48:09.704Z',
            type: 'user',
            message: {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '[Request interrupted by user]'
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

      expect(result.messages).to.have.length(1)
      const message = result.messages[0]

      expect(message.type).to.equal('system')
      expect(message.content).to.equal('Request interrupted by user')
      expect(message.system_type).to.equal('status')
      expect(message.metadata.is_interrupt).to.be.true
    })

    it('should detect interrupt pattern in array content with string item', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-uuid-1',
            timestamp: '2025-07-26T16:48:09.704Z',
            type: 'user',
            message: {
              role: 'user',
              content: ['[Request interrupted by user]']
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

      expect(result.messages).to.have.length(1)
      const message = result.messages[0]

      expect(message.type).to.equal('system')
      expect(message.content).to.equal('Request interrupted by user')
      expect(message.metadata.is_interrupt).to.be.true
    })

    it('should handle whitespace trimming in interrupt detection', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-uuid-1',
            timestamp: '2025-07-26T16:48:09.704Z',
            type: 'user',
            message: {
              role: 'user',
              content: '  [Request interrupted by user]  '
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

      expect(result.messages).to.have.length(1)
      const message = result.messages[0]

      expect(message.type).to.equal('system')
      expect(message.content).to.equal('Request interrupted by user')
      expect(message.metadata.is_interrupt).to.be.true
    })
  })

  describe('non-interrupt message handling', () => {
    it('should not affect regular user messages', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-uuid-1',
            timestamp: '2025-07-26T16:48:09.704Z',
            type: 'user',
            message: {
              role: 'user',
              content: 'This is a normal user message'
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

      expect(result.messages).to.have.length(1)
      const message = result.messages[0]

      expect(message.type).to.equal('message')
      expect(message.role).to.equal('user')
      expect(message.content).to.equal('This is a normal user message')
      expect(message.metadata.is_interrupt).to.be.undefined
    })

    it('should not affect messages with similar but different patterns', () => {
      const test_cases = [
        'Request interrupted by user', // Missing brackets
        '[Request interrupted]', // Incomplete text
        '[User interrupted request]', // Different wording
        '[Request interrupted by user] with extra text' // Extra content
      ]

      test_cases.forEach((content, index) => {
        const claude_session = {
          session_id: 'test-session',
          entries: [
            {
              uuid: `test-uuid-${index}`,
              timestamp: '2025-07-26T16:48:09.704Z',
              type: 'user',
              message: {
                role: 'user',
                content
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

        expect(result.messages).to.have.length(1)
        const message = result.messages[0]

        expect(message.type).to.equal(
          'message',
          `Failed for content: "${content}"`
        )
        expect(message.role).to.equal('user')
        expect(message.metadata.is_interrupt).to.be.undefined
      })
    })

    it('should not affect assistant messages', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-uuid-1',
            timestamp: '2025-07-26T16:48:09.704Z',
            type: 'assistant',
            message: {
              role: 'assistant',
              content: '[Request interrupted by user]'
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

      expect(result.messages).to.have.length(1)
      const message = result.messages[0]

      expect(message.type).to.equal('message')
      expect(message.role).to.equal('assistant')
      expect(message.metadata.is_interrupt).to.be.undefined
    })
  })

  describe('metadata preservation', () => {
    it('should preserve all original metadata for interrupt messages', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-uuid-1',
            timestamp: '2025-07-26T16:48:09.704Z',
            type: 'user',
            message: {
              role: 'user',
              content: '[Request interrupted by user]'
            },
            cwd: '/test/working/dir',
            userType: 'external',
            gitBranch: 'feature/test-branch',
            parse_line_number: 42,
            isMeta: true,
            line_number: 1
          }
        ],
        metadata: {
          cwd: '/test/dir',
          version: '1.0.0'
        }
      }

      const result = normalize_claude_session(claude_session)

      expect(result.messages).to.have.length(1)
      const message = result.messages[0]

      expect(message.metadata.working_directory).to.equal('/test/working/dir')
      expect(message.metadata.user_type).to.equal('external')
      expect(message.metadata.git_branch).to.equal('feature/test-branch')
      expect(message.metadata.parse_line_number).to.equal(42)
      expect(message.metadata.is_meta).to.be.true
      expect(message.metadata.original_type).to.equal('user')
      expect(message.metadata.is_interrupt).to.be.true
      expect(message.metadata.original_content).to.equal(
        '[Request interrupted by user]'
      )
    })
  })

  describe('edge cases', () => {
    it('should handle empty content gracefully', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-uuid-1',
            timestamp: '2025-07-26T16:48:09.704Z',
            type: 'user',
            message: {
              role: 'user',
              content: ''
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

      expect(result.messages).to.have.length(0) // Empty content should be filtered out
    })

    it('should handle null/undefined content gracefully', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-uuid-1',
            timestamp: '2025-07-26T16:48:09.704Z',
            type: 'user',
            message: {
              role: 'user',
              content: null
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

      expect(result.messages).to.have.length(0) // Null content should be filtered out
    })

    it('should handle multiple content items where only one matches', () => {
      const claude_session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'test-uuid-1',
            timestamp: '2025-07-26T16:48:09.704Z',
            type: 'user',
            message: {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '[Request interrupted by user]'
                },
                {
                  type: 'text',
                  text: 'Additional text'
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

      expect(result.messages).to.have.length(1)
      const message = result.messages[0]

      // Should still process as regular user message since it has multiple content items
      expect(message.type).to.equal('message')
      expect(message.role).to.equal('user')
      expect(message.metadata.is_interrupt).to.be.undefined
    })
  })
})
