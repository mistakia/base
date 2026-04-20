import { describe, it, before, after } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import {
  extract_claude_session_metadata,
  stream_claude_sessions,
  get_session_file_timestamp
} from '#libs-server/integrations/claude/parse-jsonl.mjs'
import {
  iterate_claude_session_files,
  scan_claude_agent_relationships
} from '#libs-server/integrations/claude/claude-session-helpers.mjs'
import { clear_sync_state } from '#libs-server/integrations/claude/sync-state.mjs'
import { ClaudeSessionProvider } from '#libs-server/integrations/claude/claude-session-provider.mjs'
import {
  register_user_base_directory,
  clear_registered_directories
} from '#libs-server/base-uri/base-directory-registry.mjs'

describe('Claude Session Streaming', function () {
  this.timeout(10000)

  let test_dir
  let project_dir

  before(async () => {
    // Create temporary test directory structure
    test_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-stream-test-'))
    project_dir = path.join(test_dir, 'projects', '-Users-test-project')
    await fs.mkdir(project_dir, { recursive: true })
  })

  after(async () => {
    // Clean up test directory
    if (test_dir) {
      await fs.rm(test_dir, { recursive: true, force: true })
    }
  })

  describe('extract_claude_session_metadata', () => {
    it('should extract metadata from parent session file', async () => {
      // Create a test session file
      const session_id = '550e8400-e29b-41d4-a716-446655440000'
      const session_file = path.join(project_dir, `${session_id}.jsonl`)
      const entries = [
        JSON.stringify({
          uuid: 'entry-1',
          timestamp: '2025-01-01T00:00:00.000Z',
          type: 'user',
          message: { content: 'Hello' }
        }),
        JSON.stringify({
          uuid: 'entry-2',
          timestamp: '2025-01-01T00:00:01.000Z',
          type: 'assistant',
          message: { content: 'Hi there!' }
        })
      ]
      await fs.writeFile(session_file, entries.join('\n'))

      const metadata = await extract_claude_session_metadata({
        file_path: session_file
      })

      expect(metadata.session_id).to.equal(session_id)
      expect(metadata.is_agent).to.be.false
      expect(metadata.parent_session_id).to.be.null
      expect(metadata.agent_id).to.be.null
    })

    it('should identify agent session by filename prefix', async () => {
      const subagents_dir = path.join(
        project_dir,
        '550e8400-e29b-41d4-a716-446655440000',
        'subagents'
      )
      await fs.mkdir(subagents_dir, { recursive: true })

      const agent_file = path.join(subagents_dir, 'agent-a1b2c3d4.jsonl')
      const entries = [
        JSON.stringify({
          uuid: 'agent-entry-1',
          timestamp: '2025-01-01T00:00:00.000Z',
          type: 'user',
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: 'a1b2c3d4',
          message: { content: 'Agent working' }
        })
      ]
      await fs.writeFile(agent_file, entries.join('\n'))

      const metadata = await extract_claude_session_metadata({
        file_path: agent_file
      })

      expect(metadata.session_id).to.equal('agent-a1b2c3d4')
      expect(metadata.is_agent).to.be.true
      expect(metadata.agent_id).to.equal('a1b2c3d4')
      expect(metadata.parent_session_id).to.equal(
        '550e8400-e29b-41d4-a716-446655440000'
      )
    })

    it('should extract parent_session_id from entry sessionId field', async () => {
      const agent_file = path.join(project_dir, 'agent-deadbeef.jsonl')
      const entries = [
        JSON.stringify({
          uuid: 'entry-1',
          timestamp: '2025-01-01T00:00:00.000Z',
          type: 'user',
          sessionId: 'parent-session-uuid',
          agentId: 'deadbeef',
          message: { content: 'Working' }
        })
      ]
      await fs.writeFile(agent_file, entries.join('\n'))

      const metadata = await extract_claude_session_metadata({
        file_path: agent_file
      })

      expect(metadata.is_agent).to.be.true
      expect(metadata.parent_session_id).to.equal('parent-session-uuid')
      expect(metadata.agent_id).to.equal('deadbeef')
    })

    it('should only read first N lines for efficiency', async () => {
      const session_file = path.join(project_dir, 'large-session.jsonl')
      // Create a file with many entries
      const entries = []
      for (let i = 0; i < 100; i++) {
        entries.push(
          JSON.stringify({
            uuid: `entry-${i}`,
            timestamp: `2025-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
            type: i % 2 === 0 ? 'user' : 'assistant',
            message: { content: `Message ${i}` }
          })
        )
      }
      await fs.writeFile(session_file, entries.join('\n'))

      // Should still work efficiently with default max_lines
      const metadata = await extract_claude_session_metadata({
        file_path: session_file,
        max_lines: 5
      })

      expect(metadata.session_id).to.equal('large-session')
    })
  })

  describe('iterate_claude_session_files', () => {
    it('should yield session files with metadata', async () => {
      // Create test files
      const session1 = path.join(project_dir, 'session-1.jsonl')
      const session2 = path.join(project_dir, 'session-2.jsonl')
      await fs.writeFile(
        session1,
        JSON.stringify({ uuid: '1', type: 'user', message: { content: 'hi' } })
      )
      await fs.writeFile(
        session2,
        JSON.stringify({ uuid: '2', type: 'user', message: { content: 'hi' } })
      )

      const files = []
      for await (const file_info of iterate_claude_session_files({
        claude_projects_directory: test_dir
      })) {
        files.push(file_info)
      }

      expect(files.length).to.be.at.least(2)

      const session1_info = files.find((f) => f.session_id === 'session-1')
      expect(session1_info).to.exist
      expect(session1_info.file_path).to.include('session-1.jsonl')
      expect(session1_info.is_agent).to.be.false
    })

    it('should identify agent files in subagents directory', async () => {
      const parent_id = 'parent-uuid-123'
      const subagents_dir = path.join(project_dir, parent_id, 'subagents')
      await fs.mkdir(subagents_dir, { recursive: true })

      const agent_file = path.join(subagents_dir, 'agent-abcd1234.jsonl')
      await fs.writeFile(
        agent_file,
        JSON.stringify({
          uuid: 'a1',
          type: 'user',
          sessionId: parent_id,
          message: { content: 'agent' }
        })
      )

      const files = []
      for await (const file_info of iterate_claude_session_files({
        claude_projects_directory: test_dir
      })) {
        files.push(file_info)
      }

      const agent_info = files.find((f) => f.session_id === 'agent-abcd1234')
      expect(agent_info).to.exist
      expect(agent_info.is_agent).to.be.true
    })
  })

  describe('scan_claude_agent_relationships', () => {
    it('should build agent relationship index', async () => {
      // Create parent session
      const parent_id = 'test-parent-uuid'
      const parent_file = path.join(project_dir, `${parent_id}.jsonl`)
      await fs.writeFile(
        parent_file,
        JSON.stringify({
          uuid: 'p1',
          type: 'user',
          message: { content: 'hello' }
        })
      )

      // Create agent session in subagents directory
      const subagents_dir = path.join(project_dir, parent_id, 'subagents')
      await fs.mkdir(subagents_dir, { recursive: true })

      const agent_file = path.join(subagents_dir, 'agent-11112222.jsonl')
      await fs.writeFile(
        agent_file,
        JSON.stringify({
          uuid: 'a1',
          type: 'user',
          sessionId: parent_id,
          agentId: '11112222',
          message: { content: 'agent working' }
        })
      )

      const index = await scan_claude_agent_relationships({
        claude_projects_directory: test_dir
      })

      expect(index.parent_session_files.has(parent_id)).to.be.true
      expect(index.agent_session_ids.has('agent-11112222')).to.be.true

      const agent_files = index.parent_to_agent_files.get(parent_id)
      expect(agent_files).to.be.an('array')
      expect(agent_files.length).to.be.at.least(1)
      expect(agent_files[0].agent_id).to.equal('11112222')
    })
  })

  describe('stream_claude_sessions', () => {
    it('should yield parent sessions with merged agents', async () => {
      // Create a new isolated project directory for this test
      const stream_test_dir = path.join(test_dir, 'stream-test')
      const stream_project_dir = path.join(
        stream_test_dir,
        'projects',
        '-Users-stream'
      )
      await fs.mkdir(stream_project_dir, { recursive: true })

      // Create parent session
      const parent_id = 'stream-parent-uuid'
      const parent_file = path.join(stream_project_dir, `${parent_id}.jsonl`)
      await fs.writeFile(
        parent_file,
        [
          JSON.stringify({
            uuid: 'p1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'hello' }
          }),
          JSON.stringify({
            uuid: 'p2',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'assistant',
            message: { content: 'hi there' }
          })
        ].join('\n')
      )

      // Create agent session
      const subagents_dir = path.join(
        stream_project_dir,
        parent_id,
        'subagents'
      )
      await fs.mkdir(subagents_dir, { recursive: true })

      const agent_file = path.join(subagents_dir, 'agent-33334444.jsonl')
      await fs.writeFile(
        agent_file,
        [
          JSON.stringify({
            uuid: 'a1',
            timestamp: '2025-01-01T00:00:00.500Z',
            type: 'user',
            sessionId: parent_id,
            agentId: '33334444',
            message: { content: 'agent working' }
          }),
          JSON.stringify({
            uuid: 'a2',
            timestamp: '2025-01-01T00:00:00.600Z',
            type: 'assistant',
            message: { content: 'agent done' }
          })
        ].join('\n')
      )

      // Build agent index
      const agent_index = await scan_claude_agent_relationships({
        claude_projects_directory: stream_test_dir
      })

      // Stream sessions
      const sessions = []
      for await (const session of stream_claude_sessions({
        agent_index,
        include_warm_agents: true
      })) {
        sessions.push(session)
      }

      expect(sessions.length).to.equal(1)

      const parent_session = sessions.find((s) => s.session_id === parent_id)
      expect(parent_session).to.exist
      expect(parent_session.agent_sessions).to.be.an('array')
      expect(parent_session.agent_sessions.length).to.equal(1)
      expect(parent_session.agent_sessions[0].session_id).to.equal(
        'agent-33334444'
      )
    })

    it('should skip agent sessions from iteration', async () => {
      // Create test directory
      const skip_test_dir = path.join(test_dir, 'skip-test')
      const skip_project_dir = path.join(
        skip_test_dir,
        'projects',
        '-Users-skip'
      )
      await fs.mkdir(skip_project_dir, { recursive: true })

      // Create only an agent session (no parent)
      const orphan_agent_file = path.join(
        skip_project_dir,
        'agent-orphan123.jsonl'
      )
      await fs.writeFile(
        orphan_agent_file,
        JSON.stringify({
          uuid: 'o1',
          type: 'user',
          sessionId: 'missing-parent',
          agentId: 'orphan123',
          message: { content: 'orphan' }
        })
      )

      // Build agent index
      const agent_index = await scan_claude_agent_relationships({
        claude_projects_directory: skip_test_dir
      })

      // Stream sessions - should not yield orphan agent
      const sessions = []
      for await (const session of stream_claude_sessions({
        agent_index
      })) {
        sessions.push(session)
      }

      // Orphan agents are not yielded as standalone sessions
      expect(sessions.length).to.equal(0)
    })

    it('should apply filter function', async () => {
      // Create test directory
      const filter_test_dir = path.join(test_dir, 'filter-test')
      const filter_project_dir = path.join(
        filter_test_dir,
        'projects',
        '-Users-filter'
      )
      await fs.mkdir(filter_project_dir, { recursive: true })

      // Create two sessions
      await fs.writeFile(
        path.join(filter_project_dir, 'keep-session.jsonl'),
        JSON.stringify({
          uuid: 'k1',
          timestamp: '2025-01-15T00:00:00.000Z',
          type: 'user',
          message: { content: 'keep' }
        })
      )
      await fs.writeFile(
        path.join(filter_project_dir, 'filter-session.jsonl'),
        JSON.stringify({
          uuid: 'f1',
          timestamp: '2025-01-01T00:00:00.000Z',
          type: 'user',
          message: { content: 'filter' }
        })
      )

      // Build agent index
      const agent_index = await scan_claude_agent_relationships({
        claude_projects_directory: filter_test_dir
      })

      // Stream with filter
      const sessions = []
      for await (const session of stream_claude_sessions({
        agent_index,
        filter_session: (s) => s.session_id === 'keep-session'
      })) {
        sessions.push(session)
      }

      expect(sessions.length).to.equal(1)
      expect(sessions[0].session_id).to.equal('keep-session')
    })
  })

  describe('get_session_file_timestamp', () => {
    it('should extract timestamp from first non-summary entry', async () => {
      const session_file = path.join(project_dir, 'ts-extract-test.jsonl')
      const entries = [
        JSON.stringify({
          type: 'summary',
          summary: 'Session summary'
        }),
        JSON.stringify({
          uuid: 'entry-1',
          timestamp: '2025-06-15T10:30:00.000Z',
          type: 'user',
          message: { content: 'Hello' }
        }),
        JSON.stringify({
          uuid: 'entry-2',
          timestamp: '2025-06-15T10:31:00.000Z',
          type: 'assistant',
          message: { content: 'Hi' }
        })
      ]
      await fs.writeFile(session_file, entries.join('\n'))

      const timestamp = await get_session_file_timestamp({
        file_path: session_file
      })

      expect(timestamp).to.equal('2025-06-15T10:30:00.000Z')
    })

    it('should return null for file with no timestamps', async () => {
      const session_file = path.join(project_dir, 'no-ts-test.jsonl')
      await fs.writeFile(
        session_file,
        JSON.stringify({ type: 'summary', summary: 'No timestamps here' })
      )

      const timestamp = await get_session_file_timestamp({
        file_path: session_file
      })

      expect(timestamp).to.be.null
    })

    it('should skip snapshot entries', async () => {
      const session_file = path.join(project_dir, 'snapshot-skip-test.jsonl')
      const entries = [
        JSON.stringify({ type: 'snapshot', data: {} }),
        JSON.stringify({
          uuid: 'entry-1',
          timestamp: '2025-08-01T12:00:00.000Z',
          type: 'user',
          message: { content: 'Hello' }
        })
      ]
      await fs.writeFile(session_file, entries.join('\n'))

      const timestamp = await get_session_file_timestamp({
        file_path: session_file
      })

      expect(timestamp).to.equal('2025-08-01T12:00:00.000Z')
    })
  })

  describe('stream_claude_sessions with date filtering', () => {
    it('should skip sessions outside from_date range', async () => {
      const date_test_dir = path.join(test_dir, 'date-filter-test')
      const date_project_dir = path.join(
        date_test_dir,
        'projects',
        '-Users-date'
      )
      await fs.mkdir(date_project_dir, { recursive: true })

      // Create old session (January 2025)
      await fs.writeFile(
        path.join(date_project_dir, 'old-session.jsonl'),
        JSON.stringify({
          uuid: 'o1',
          timestamp: '2025-01-05T10:00:00.000Z',
          type: 'user',
          message: { content: 'old' }
        })
      )

      // Create recent session (June 2025)
      await fs.writeFile(
        path.join(date_project_dir, 'recent-session.jsonl'),
        JSON.stringify({
          uuid: 'r1',
          timestamp: '2025-06-15T10:00:00.000Z',
          type: 'user',
          message: { content: 'recent' }
        })
      )

      const agent_index = await scan_claude_agent_relationships({
        claude_projects_directory: date_test_dir
      })

      const sessions = []
      for await (const session of stream_claude_sessions({
        agent_index,
        from_date: '2025-06-01'
      })) {
        sessions.push(session)
      }

      expect(sessions.length).to.equal(1)
      expect(sessions[0].session_id).to.equal('recent-session')
    })

    it('should skip sessions outside to_date range', async () => {
      const to_date_test_dir = path.join(test_dir, 'to-date-filter-test')
      const to_date_project_dir = path.join(
        to_date_test_dir,
        'projects',
        '-Users-todate'
      )
      await fs.mkdir(to_date_project_dir, { recursive: true })

      // Create early session (January 2025)
      await fs.writeFile(
        path.join(to_date_project_dir, 'early-session.jsonl'),
        JSON.stringify({
          uuid: 'e1',
          timestamp: '2025-01-10T10:00:00.000Z',
          type: 'user',
          message: { content: 'early' }
        })
      )

      // Create late session (December 2025)
      await fs.writeFile(
        path.join(to_date_project_dir, 'late-session.jsonl'),
        JSON.stringify({
          uuid: 'l1',
          timestamp: '2025-12-20T10:00:00.000Z',
          type: 'user',
          message: { content: 'late' }
        })
      )

      const agent_index = await scan_claude_agent_relationships({
        claude_projects_directory: to_date_test_dir
      })

      const sessions = []
      for await (const session of stream_claude_sessions({
        agent_index,
        to_date: '2025-06-30'
      })) {
        sessions.push(session)
      }

      expect(sessions.length).to.equal(1)
      expect(sessions[0].session_id).to.equal('early-session')
    })
  })

  describe('ClaudeSessionProvider.stream_sessions with session_file', () => {
    before(() => {
      // Register the test directory as user base for config resolution
      register_user_base_directory(test_dir)
    })

    after(async () => {
      clear_registered_directories()
      // Clean up sync state files created by incremental parse
      const provider_parent_file = path.resolve(
        test_dir,
        'provider-session-file/projects/-Users-provider/provider-parent-uuid.jsonl'
      )
      const orphan_agent_file = path.resolve(
        test_dir,
        'provider-orphan-agent/projects/-Users-orphan/agent-orphan999.jsonl'
      )
      const warm_parent_file = path.resolve(
        test_dir,
        'provider-warm-agent/projects/-Users-warm/warm-parent-uuid.jsonl'
      )
      await clear_sync_state({ session_id: provider_parent_file }).catch(
        () => {}
      )
      await clear_sync_state({ session_id: orphan_agent_file }).catch(() => {})
      await clear_sync_state({ session_id: warm_parent_file }).catch(() => {})
    })

    it('should yield single merged session when session_file has subagents', async () => {
      // Create isolated test directory
      const provider_test_dir = path.join(test_dir, 'provider-session-file')
      const provider_project_dir = path.join(
        provider_test_dir,
        'projects',
        '-Users-provider'
      )
      await fs.mkdir(provider_project_dir, { recursive: true })

      // Create parent session
      const parent_id = 'provider-parent-uuid'
      const parent_file = path.join(provider_project_dir, `${parent_id}.jsonl`)
      await fs.writeFile(
        parent_file,
        [
          JSON.stringify({
            uuid: 'p1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'hello' }
          }),
          JSON.stringify({
            uuid: 'p2',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'assistant',
            message: { content: 'hi there' }
          })
        ].join('\n')
      )

      // Create agent session in subagents directory
      const subagents_dir = path.join(
        provider_project_dir,
        parent_id,
        'subagents'
      )
      await fs.mkdir(subagents_dir, { recursive: true })

      const agent_file = path.join(subagents_dir, 'agent-55556666.jsonl')
      await fs.writeFile(
        agent_file,
        [
          JSON.stringify({
            uuid: 'a1',
            timestamp: '2025-01-01T00:00:00.500Z',
            type: 'user',
            sessionId: parent_id,
            agentId: '55556666',
            message: { content: 'agent working' }
          }),
          JSON.stringify({
            uuid: 'a2',
            timestamp: '2025-01-01T00:00:00.600Z',
            type: 'assistant',
            message: { content: 'agent done' }
          })
        ].join('\n')
      )

      // Use ClaudeSessionProvider with session_file
      const provider = new ClaudeSessionProvider()
      const sessions = []
      for await (const session of provider.stream_sessions({
        claude_projects_directory: provider_test_dir,
        session_file: parent_file,
        include_warm_agents: true
      })) {
        sessions.push(session)
      }

      // Should yield only the parent session with agents merged
      expect(sessions.length).to.equal(1)
      expect(sessions[0].session_id).to.equal(parent_id)
      expect(sessions[0].agent_sessions).to.be.an('array')
      expect(sessions[0].agent_sessions.length).to.equal(1)
      expect(sessions[0].agent_sessions[0].session_id).to.equal(
        'agent-55556666'
      )
    })

    it('should skip orphan agent when session_file points to agent directly', async () => {
      // Create isolated test directory
      const orphan_test_dir = path.join(test_dir, 'provider-orphan-agent')
      const orphan_project_dir = path.join(
        orphan_test_dir,
        'projects',
        '-Users-orphan'
      )
      await fs.mkdir(orphan_project_dir, { recursive: true })

      // Create only an agent file (no parent exists)
      const agent_file = path.join(orphan_project_dir, 'agent-orphan999.jsonl')
      await fs.writeFile(
        agent_file,
        JSON.stringify({
          uuid: 'o1',
          timestamp: '2025-01-01T00:00:00.000Z',
          type: 'user',
          sessionId: 'nonexistent-parent',
          agentId: 'orphan999',
          message: { content: 'orphan agent' }
        })
      )

      // Use ClaudeSessionProvider with session_file pointing to agent
      const provider = new ClaudeSessionProvider()
      const sessions = []
      for await (const session of provider.stream_sessions({
        claude_projects_directory: orphan_test_dir,
        session_file: agent_file
      })) {
        sessions.push(session)
      }

      // Should not yield orphan agent as standalone session
      expect(sessions.length).to.equal(0)
    })

    it('should exclude warm agents from merged results by default', async () => {
      // Create isolated test directory
      const warm_test_dir = path.join(test_dir, 'provider-warm-agent')
      const warm_project_dir = path.join(
        warm_test_dir,
        'projects',
        '-Users-warm'
      )
      await fs.mkdir(warm_project_dir, { recursive: true })

      // Create parent session
      const parent_id = 'warm-parent-uuid'
      const parent_file = path.join(warm_project_dir, `${parent_id}.jsonl`)
      await fs.writeFile(
        parent_file,
        [
          JSON.stringify({
            uuid: 'p1',
            timestamp: '2025-01-01T00:00:00.000Z',
            type: 'user',
            message: { content: 'hello' }
          }),
          JSON.stringify({
            uuid: 'p2',
            timestamp: '2025-01-01T00:00:01.000Z',
            type: 'assistant',
            message: { content: 'hi there' }
          })
        ].join('\n')
      )

      // Create warm agent (initialization agent with "Warmup" message)
      const subagents_dir = path.join(warm_project_dir, parent_id, 'subagents')
      await fs.mkdir(subagents_dir, { recursive: true })

      const warm_agent_file = path.join(subagents_dir, 'agent-warmwarm.jsonl')
      await fs.writeFile(
        warm_agent_file,
        JSON.stringify({
          uuid: 'w1',
          timestamp: '2025-01-01T00:00:00.100Z',
          type: 'user',
          sessionId: parent_id,
          agentId: 'warmwarm',
          message: { content: 'Warmup' }
        })
      )

      // Create real agent with actual work
      const real_agent_file = path.join(subagents_dir, 'agent-realreal.jsonl')
      await fs.writeFile(
        real_agent_file,
        [
          JSON.stringify({
            uuid: 'r1',
            timestamp: '2025-01-01T00:00:00.500Z',
            type: 'user',
            sessionId: parent_id,
            agentId: 'realreal',
            message: { content: 'Do actual work' }
          }),
          JSON.stringify({
            uuid: 'r2',
            timestamp: '2025-01-01T00:00:00.600Z',
            type: 'assistant',
            message: { content: 'Work completed' }
          })
        ].join('\n')
      )

      // Use ClaudeSessionProvider with default include_warm_agents=false
      const provider = new ClaudeSessionProvider()
      const sessions = []
      for await (const session of provider.stream_sessions({
        claude_projects_directory: warm_test_dir,
        session_file: parent_file
        // include_warm_agents defaults to false
      })) {
        sessions.push(session)
      }

      // Should yield parent with only the real agent, warm agent excluded
      expect(sessions.length).to.equal(1)
      expect(sessions[0].session_id).to.equal(parent_id)
      expect(sessions[0].agent_sessions).to.be.an('array')
      expect(sessions[0].agent_sessions.length).to.equal(1)
      expect(sessions[0].agent_sessions[0].session_id).to.equal(
        'agent-realreal'
      )
    })
  })
})
