import { describe, it } from 'mocha'
import { expect } from 'chai'

import {
  merge_agent_entries_into_parent,
  assign_merged_sequence_numbers,
  merge_and_sequence_agent_sessions
} from '#libs-server/integrations/claude/merge-agent-sessions.mjs'

describe('Claude Agent Session Merging', () => {
  describe('merge_agent_entries_into_parent', () => {
    it('should merge agent entries into parent session', () => {
      const parent_session = {
        session_id: 'parent-session-1',
        entries: [
          {
            uuid: 'parent-entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'Hello' }
          },
          {
            uuid: 'parent-entry-2',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'assistant',
            message: {
              content: [
                { type: 'text', text: 'I will help you.' },
                { type: 'tool_use', name: 'Task', id: 'toolu_123' }
              ]
            }
          },
          {
            uuid: 'parent-entry-3',
            timestamp: '2025-01-01T00:00:10.000Z',
            type: 'user',
            toolUseResult: { agentId: 'a1b2c3d4' },
            toolUseID: 'toolu_123',
            message: { content: 'Task completed' }
          }
        ],
        metadata: {}
      }

      const agent_session = {
        session_id: 'agent-a1b2c3d4',
        entries: [
          {
            uuid: 'agent-entry-1',
            timestamp: '2025-01-01T00:00:02.000Z',
            type: 'user',
            sessionId: 'parent-session-1',
            message: { content: 'Agent working...' }
          },
          {
            uuid: 'agent-entry-2',
            timestamp: '2025-01-01T00:00:03.000Z',
            type: 'assistant',
            message: { content: 'Agent response' }
          }
        ],
        metadata: {}
      }

      const result = merge_agent_entries_into_parent({
        parent_session,
        agent_sessions: [agent_session]
      })

      // Should have 5 entries total (3 parent + 2 agent)
      expect(result.entries).to.have.length(5)

      // Agent entries should be marked as sidechain
      const agent_entries = result.entries.filter((e) => e.isSidechain)
      expect(agent_entries).to.have.length(2)

      // Metadata should track merged agents
      expect(result.metadata.merged_agent_count).to.equal(1)
      expect(result.metadata.merged_agent_entries).to.equal(2)
    })

    it('should return parent unchanged when no agents provided', () => {
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
        metadata: { existing: true }
      }

      const result = merge_agent_entries_into_parent({
        parent_session,
        agent_sessions: []
      })

      expect(result).to.equal(parent_session)
    })

    it('should mark agent entries with sidechain metadata', () => {
      const parent_session = {
        session_id: 'parent-session-1',
        entries: [
          {
            uuid: 'parent-entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'Hello' }
          }
        ],
        metadata: {}
      }

      const agent_session = {
        session_id: 'agent-deadbeef',
        entries: [
          {
            uuid: 'agent-entry-1',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'user',
            sessionId: 'parent-session-1',
            message: { content: 'Agent task' }
          }
        ],
        metadata: {}
      }

      const result = merge_agent_entries_into_parent({
        parent_session,
        agent_sessions: [agent_session]
      })

      const agent_entry = result.entries.find((e) => e.isSidechain)
      expect(agent_entry).to.exist
      expect(agent_entry.isSidechain).to.be.true
      expect(agent_entry.agentSessionId).to.equal('agent-deadbeef')
      expect(agent_entry.parentAgentId).to.equal('deadbeef')
    })

    it('should handle multiple agent sessions', () => {
      const parent_session = {
        session_id: 'parent-session-1',
        entries: [
          {
            uuid: 'parent-entry-1',
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
            sessionId: 'parent-session-1',
            message: { content: 'Agent 1' }
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
            sessionId: 'parent-session-1',
            message: { content: 'Agent 2' }
          }
        ],
        metadata: {}
      }

      const result = merge_agent_entries_into_parent({
        parent_session,
        agent_sessions: [agent1, agent2]
      })

      expect(result.entries).to.have.length(3)
      expect(result.metadata.merged_agent_count).to.equal(2)
      expect(result.metadata.merged_agent_entries).to.equal(2)
      expect(result.metadata.merged_agent_ids).to.include('11111111')
      expect(result.metadata.merged_agent_ids).to.include('22222222')
    })
  })

  describe('assign_merged_sequence_numbers', () => {
    it('should assign sequential numbers sorted by timestamp', () => {
      const session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'entry-3',
            timestamp: '2025-01-01T00:00:03.000Z',
            type: 'user'
          },
          {
            uuid: 'entry-1',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'user'
          },
          {
            uuid: 'entry-2',
            timestamp: '2025-01-01T00:00:02.000Z',
            type: 'assistant'
          }
        ],
        metadata: {}
      }

      const result = assign_merged_sequence_numbers({ session })

      // Entries should be sorted by timestamp
      expect(result.entries[0].uuid).to.equal('entry-1')
      expect(result.entries[1].uuid).to.equal('entry-2')
      expect(result.entries[2].uuid).to.equal('entry-3')

      // Sequence numbers should be assigned
      expect(result.entries[0].merged_sequence).to.equal(0)
      expect(result.entries[1].merged_sequence).to.equal(1)
      expect(result.entries[2].merged_sequence).to.equal(2)
    })

    it('should place sidechain entries after non-sidechain at same timestamp', () => {
      const session = {
        session_id: 'test-session',
        entries: [
          {
            uuid: 'sidechain-entry',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'user',
            isSidechain: true
          },
          {
            uuid: 'main-entry',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'assistant',
            isSidechain: false
          }
        ],
        metadata: {}
      }

      const result = assign_merged_sequence_numbers({ session })

      // Main entry should come before sidechain entry
      expect(result.entries[0].isSidechain).to.be.false
      expect(result.entries[1].isSidechain).to.be.true
    })

    it('should handle empty entries', () => {
      const session = {
        session_id: 'test-session',
        entries: [],
        metadata: {}
      }

      const result = assign_merged_sequence_numbers({ session })

      expect(result.entries).to.have.length(0)
    })
  })

  describe('merge_and_sequence_agent_sessions', () => {
    it('should merge and sequence in one operation', () => {
      const parent_session = {
        session_id: 'parent-session-1',
        entries: [
          {
            uuid: 'parent-entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'Hello' }
          },
          {
            uuid: 'parent-entry-2',
            timestamp: '2025-01-01T00:00:05.000Z',
            type: 'assistant',
            message: { content: 'Goodbye' }
          }
        ],
        metadata: {}
      }

      const agent_session = {
        session_id: 'agent-a1b2c3d4',
        entries: [
          {
            uuid: 'agent-entry-1',
            timestamp: '2025-01-01T00:00:02.000Z',
            type: 'user',
            sessionId: 'parent-session-1',
            message: { content: 'Agent working' }
          }
        ],
        metadata: {}
      }

      const result = merge_and_sequence_agent_sessions({
        parent_session,
        agent_sessions: [agent_session]
      })

      // Should have 3 entries total
      expect(result.entries).to.have.length(3)

      // Should be sorted by timestamp with sequence numbers
      expect(result.entries[0].merged_sequence).to.equal(0)
      expect(result.entries[1].merged_sequence).to.equal(1)
      expect(result.entries[2].merged_sequence).to.equal(2)

      // Agent entry should be in the middle (by timestamp)
      const agent_entry = result.entries.find((e) => e.isSidechain)
      expect(agent_entry.merged_sequence).to.equal(1)
    })

    it('should preserve all metadata through merge and sequence', () => {
      const parent_session = {
        session_id: 'parent-session-1',
        entries: [
          {
            uuid: 'parent-entry-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'Hello' }
          }
        ],
        metadata: { original: 'metadata' }
      }

      const agent_session = {
        session_id: 'agent-deadbeef',
        entries: [
          {
            uuid: 'agent-entry-1',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'user',
            sessionId: 'parent-session-1',
            message: { content: 'Agent' }
          }
        ],
        metadata: {}
      }

      const result = merge_and_sequence_agent_sessions({
        parent_session,
        agent_sessions: [agent_session]
      })

      expect(result.session_id).to.equal('parent-session-1')
      expect(result.metadata.original).to.equal('metadata')
      expect(result.metadata.merged_agent_count).to.equal(1)
    })
  })
})
