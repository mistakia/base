import { describe, it } from 'mocha'
import { expect } from 'chai'

import {
  is_agent_session,
  is_warm_session,
  get_agent_parent_session_id,
  get_agent_id,
  group_sessions_with_agents
} from '#libs-server/integrations/claude/claude-session-helpers.mjs'

describe('Claude Agent Session Detection', () => {
  describe('is_agent_session', () => {
    it('should identify agent session by filename pattern', () => {
      const session = {
        session_id: 'agent-a1b2c3d4',
        entries: [],
        metadata: {}
      }

      expect(is_agent_session({ session })).to.be.true
    })

    it('should identify agent session by agentId in first entry', () => {
      const session = {
        session_id: 'some-regular-id',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            agentId: 'a1b2c3d4',
            sessionId: 'parent-session-id'
          }
        ],
        metadata: {}
      }

      expect(is_agent_session({ session })).to.be.true
    })

    it('should return false for regular sessions', () => {
      const session = {
        session_id: '5ede99f2-c215-4e31-aa24-9cdfd5070feb',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'Hello' }
          }
        ],
        metadata: {}
      }

      expect(is_agent_session({ session })).to.be.false
    })

    it('should return false for empty session', () => {
      const session = {
        session_id: 'regular-session',
        entries: [],
        metadata: {}
      }

      expect(is_agent_session({ session })).to.be.false
    })
  })

  describe('is_warm_session', () => {
    it('should identify warm agent with single "ready to help" message', () => {
      const session = {
        session_id: 'agent-warmup1',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'assistant',
            message: {
              content: "I'm ready to help you with your task."
            }
          }
        ],
        metadata: {}
      }

      expect(is_warm_session({ session })).to.be.true
    })

    it('should identify warm agent with "Warmup" first user message', () => {
      const session = {
        session_id: 'agent-warmup2',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: {
              content: 'Warmup'
            }
          },
          {
            uuid: 'entry-2',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'assistant',
            message: {
              content: 'Ready!'
            }
          }
        ],
        metadata: {}
      }

      expect(is_warm_session({ session })).to.be.true
    })

    it('should identify warm agent with case-insensitive "warmup"', () => {
      const session = {
        session_id: 'agent-warmup3',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: {
              content: '  WARMUP  '
            }
          }
        ],
        metadata: {}
      }

      expect(is_warm_session({ session })).to.be.true
    })

    it('should return false for work agents with actual content', () => {
      const session = {
        session_id: 'agent-work1',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: {
              content: 'Search for files matching *.js'
            }
          },
          {
            uuid: 'entry-2',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'assistant',
            message: {
              content: 'Found 15 JavaScript files.'
            }
          }
        ],
        metadata: {}
      }

      expect(is_warm_session({ session })).to.be.false
    })

    it('should return true for empty sessions', () => {
      const session = {
        session_id: 'agent-empty',
        entries: [],
        metadata: {}
      }

      expect(is_warm_session({ session })).to.be.true
    })

    it('should handle array content format', () => {
      const session = {
        session_id: 'agent-array',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'assistant',
            message: {
              content: [
                { type: 'text', text: "I'm ready to help with your request." }
              ]
            }
          }
        ],
        metadata: {}
      }

      expect(is_warm_session({ session })).to.be.true
    })
  })

  describe('get_agent_parent_session_id', () => {
    it('should extract parent session ID from entry sessionId', () => {
      const session = {
        session_id: 'agent-a1b2c3d4',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            sessionId: '5ede99f2-c215-4e31-aa24-9cdfd5070feb'
          }
        ],
        metadata: {}
      }

      expect(get_agent_parent_session_id({ session })).to.equal(
        '5ede99f2-c215-4e31-aa24-9cdfd5070feb'
      )
    })

    it('should return null when no sessionId found', () => {
      const session = {
        session_id: 'agent-orphan',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user'
          }
        ],
        metadata: {}
      }

      expect(get_agent_parent_session_id({ session })).to.be.null
    })

    it('should return null for empty entries', () => {
      const session = {
        session_id: 'agent-empty',
        entries: [],
        metadata: {}
      }

      expect(get_agent_parent_session_id({ session })).to.be.null
    })
  })

  describe('get_agent_id', () => {
    it('should extract agent ID from session_id pattern', () => {
      const session = {
        session_id: 'agent-a1b2c3d4',
        entries: [],
        metadata: {}
      }

      expect(get_agent_id({ session })).to.equal('a1b2c3d4')
    })

    it('should extract agent ID from first entry agentId', () => {
      const session = {
        session_id: 'regular-session-id',
        entries: [
          {
            uuid: 'entry-1',
            agentId: 'deadbeef'
          }
        ],
        metadata: {}
      }

      expect(get_agent_id({ session })).to.equal('deadbeef')
    })

    it('should return null when no agent ID found', () => {
      const session = {
        session_id: 'regular-session-id',
        entries: [
          {
            uuid: 'entry-1'
          }
        ],
        metadata: {}
      }

      expect(get_agent_id({ session })).to.be.null
    })
  })

  describe('group_sessions_with_agents', () => {
    it('should group agent sessions with their parent', () => {
      const parent_session = {
        session_id: 'parent-session-1',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'Hello' }
          }
        ],
        metadata: {}
      }

      const agent_session = {
        session_id: 'agent-a1b2c3d4',
        entries: [
          {
            uuid: 'agent-entry-1',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'user',
            sessionId: 'parent-session-1',
            message: { content: 'Search for files' }
          }
        ],
        metadata: {}
      }

      const result = group_sessions_with_agents({
        sessions: [parent_session, agent_session]
      })

      expect(result.grouped.size).to.equal(1)
      expect(result.grouped.has('parent-session-1')).to.be.true

      const grouped = result.grouped.get('parent-session-1')
      expect(grouped.parent_session).to.equal(parent_session)
      expect(grouped.agent_sessions).to.have.length(1)
      expect(grouped.agent_sessions[0]).to.equal(agent_session)

      expect(result.standalone_sessions).to.have.length(0)
      expect(result.orphan_agents).to.have.length(0)
    })

    it('should exclude warm agents by default', () => {
      const parent_session = {
        session_id: 'parent-session-1',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'Hello' }
          }
        ],
        metadata: {}
      }

      const warm_agent = {
        session_id: 'agent-warm1234',
        entries: [
          {
            uuid: 'warm-entry-1',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'assistant',
            sessionId: 'parent-session-1',
            message: { content: "I'm ready to help!" }
          }
        ],
        metadata: {}
      }

      const result = group_sessions_with_agents({
        sessions: [parent_session, warm_agent]
      })

      expect(result.warm_agents_excluded).to.equal(1)
      expect(result.grouped.size).to.equal(0)
      expect(result.standalone_sessions).to.have.length(1)
    })

    it('should include warm agents when flag is set', () => {
      const parent_session = {
        session_id: 'parent-session-1',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'Hello' }
          }
        ],
        metadata: {}
      }

      const warm_agent = {
        session_id: 'agent-warm1234',
        entries: [
          {
            uuid: 'warm-entry-1',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'assistant',
            sessionId: 'parent-session-1',
            message: { content: "I'm ready to help!" }
          }
        ],
        metadata: {}
      }

      const result = group_sessions_with_agents({
        sessions: [parent_session, warm_agent],
        include_warm_agents: true
      })

      expect(result.warm_agents_excluded).to.equal(0)
      expect(result.grouped.size).to.equal(1)
    })

    it('should handle orphan agents without parent', () => {
      const orphan_agent = {
        session_id: 'agent-orphan12',
        entries: [
          {
            uuid: 'orphan-entry-1',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'user',
            sessionId: 'non-existent-parent',
            message: { content: 'Search for files' }
          }
        ],
        metadata: {}
      }

      const result = group_sessions_with_agents({
        sessions: [orphan_agent]
      })

      expect(result.orphan_agents).to.have.length(1)
      expect(result.orphan_agents[0]).to.equal(orphan_agent)
      expect(result.grouped.size).to.equal(0)
      expect(result.standalone_sessions).to.have.length(0)
    })

    it('should separate standalone sessions without agents', () => {
      const standalone = {
        session_id: 'standalone-session',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'Hello' }
          }
        ],
        metadata: {}
      }

      const result = group_sessions_with_agents({
        sessions: [standalone]
      })

      expect(result.standalone_sessions).to.have.length(1)
      expect(result.standalone_sessions[0]).to.equal(standalone)
      expect(result.grouped.size).to.equal(0)
    })

    it('should handle multiple agents per parent', () => {
      const parent = {
        session_id: 'parent-multi',
        entries: [
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'Hello' }
          }
        ],
        metadata: {}
      }

      const agent1 = {
        session_id: 'agent-11111111',
        entries: [
          {
            uuid: 'agent1-entry',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'user',
            sessionId: 'parent-multi',
            message: { content: 'First agent task' }
          }
        ],
        metadata: {}
      }

      const agent2 = {
        session_id: 'agent-22222222',
        entries: [
          {
            uuid: 'agent2-entry',
            timestamp: '2025-01-01T00:00:02.000Z',
            type: 'user',
            sessionId: 'parent-multi',
            message: { content: 'Second agent task' }
          }
        ],
        metadata: {}
      }

      const result = group_sessions_with_agents({
        sessions: [parent, agent1, agent2]
      })

      expect(result.grouped.size).to.equal(1)
      const grouped = result.grouped.get('parent-multi')
      expect(grouped.agent_sessions).to.have.length(2)
    })
  })
})
