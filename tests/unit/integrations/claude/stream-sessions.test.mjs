import { describe, it, before, after } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import {
  extract_claude_session_metadata,
  stream_claude_sessions
} from '#libs-server/integrations/claude/parse-jsonl.mjs'
import {
  iterate_claude_session_files,
  scan_claude_agent_relationships
} from '#libs-server/integrations/claude/claude-session-helpers.mjs'

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
})
