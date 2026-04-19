import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { find_claude_sessions_from_filesystem } from '#libs-server/integrations/claude/claude-session-helpers.mjs'
import {
  save_sync_state,
  clear_sync_state
} from '#libs-server/integrations/claude/sync-state.mjs'

const make_entry = (uuid, index) => ({
  uuid,
  parentUuid: index === 1 ? null : `uuid-${index - 1}`,
  timestamp: `2026-04-18T12:00:${String(index).padStart(2, '0')}.000Z`,
  type: index % 2 === 1 ? 'user' : 'assistant',
  cwd: '/tmp/cwd',
  message:
    index % 2 === 1
      ? { role: 'user', content: `msg ${index}` }
      : {
          role: 'assistant',
          content: [{ type: 'text', text: `reply ${index}` }],
          model: 'claude-opus-4-7'
        }
})

const serialize = (entries) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n'

describe('claude parser parse_mode decision table', function () {
  this.timeout(10000)

  let work_dir
  let session_id
  let session_file

  beforeEach(async () => {
    work_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'parser-parse-mode-'))
    session_id = `session-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    session_file = path.join(work_dir, `${session_id}.jsonl`)
  })

  afterEach(async () => {
    await clear_sync_state({ session_id: session_file }).catch(() => {})
    await fs.rm(work_dir, { recursive: true, force: true })
  })

  it('parent, no sync state -> parse_mode === full', async () => {
    await fs.writeFile(session_file, serialize([make_entry('u1', 1), make_entry('u2', 2)]))
    const sessions = await find_claude_sessions_from_filesystem({ session_file })
    expect(sessions).to.have.lengthOf(1)
    expect(sessions[0].parse_mode).to.equal('full')
  })

  it('parent, size < stored_offset -> parse_mode === full', async () => {
    await fs.writeFile(session_file, serialize([make_entry('u1', 1)]))
    const size_before = (await fs.stat(session_file)).size
    // Stored offset is beyond current file size (simulates rotation/truncation)
    await save_sync_state({
      session_id: session_file,
      state: {
        byte_offset: size_before + 10_000,
        subagent_offsets: {},
        working_directory: '/tmp/cwd'
      }
    })

    const sessions = await find_claude_sessions_from_filesystem({ session_file })
    expect(sessions).to.have.lengthOf(1)
    expect(sessions[0].parse_mode).to.equal('full')
  })

  it('parent, size == stored_offset -> session omitted from result', async () => {
    await fs.writeFile(session_file, serialize([make_entry('u1', 1), make_entry('u2', 2)]))
    const file_size = (await fs.stat(session_file)).size
    await save_sync_state({
      session_id: session_file,
      state: {
        byte_offset: file_size,
        subagent_offsets: {},
        working_directory: '/tmp/cwd'
      }
    })

    const sessions = await find_claude_sessions_from_filesystem({ session_file })
    expect(sessions).to.deep.equal([])
  })

  it('parent, size > stored_offset -> parse_mode === delta', async () => {
    await fs.writeFile(session_file, serialize([make_entry('u1', 1), make_entry('u2', 2)]))
    const file_size = (await fs.stat(session_file)).size
    await save_sync_state({
      session_id: session_file,
      state: {
        byte_offset: file_size,
        subagent_offsets: {},
        working_directory: '/tmp/cwd'
      }
    })

    await fs.appendFile(session_file, serialize([make_entry('u3', 3)]))

    const sessions = await find_claude_sessions_from_filesystem({ session_file })
    expect(sessions).to.have.lengthOf(1)
    expect(sessions[0].parse_mode).to.equal('delta')
  })

  it('subagent with offset === 0 -> parse_mode === full', async () => {
    await fs.writeFile(session_file, serialize([make_entry('u1', 1), make_entry('u2', 2)]))

    const subagents_dir = path.join(work_dir, session_id, 'subagents')
    await fs.mkdir(subagents_dir, { recursive: true })
    const agent_file = path.join(subagents_dir, 'agent-sub-1.jsonl')
    await fs.writeFile(agent_file, serialize([make_entry('a1', 1)]))

    const parent_size = (await fs.stat(session_file)).size
    await save_sync_state({
      session_id: session_file,
      state: {
        byte_offset: parent_size,
        subagent_offsets: {},
        working_directory: '/tmp/cwd'
      }
    })

    const sessions = await find_claude_sessions_from_filesystem({ session_file })
    const agent = sessions.find((s) => s.session_id === 'agent-sub-1')
    expect(agent, 'agent session returned').to.exist
    expect(agent.parse_mode).to.equal('full')
  })

  it('subagent with offset > 0 and new bytes -> parse_mode === delta', async () => {
    await fs.writeFile(session_file, serialize([make_entry('u1', 1), make_entry('u2', 2)]))

    const subagents_dir = path.join(work_dir, session_id, 'subagents')
    await fs.mkdir(subagents_dir, { recursive: true })
    const agent_file = path.join(subagents_dir, 'agent-sub-1.jsonl')
    await fs.writeFile(agent_file, serialize([make_entry('a1', 1)]))

    const parent_size = (await fs.stat(session_file)).size
    const agent_size = (await fs.stat(agent_file)).size
    await save_sync_state({
      session_id: session_file,
      state: {
        byte_offset: parent_size,
        subagent_offsets: {
          'agent-sub-1.jsonl': { byte_offset: agent_size }
        },
        working_directory: '/tmp/cwd'
      }
    })

    // Append new bytes to the subagent file
    await fs.appendFile(agent_file, serialize([make_entry('a2', 2)]))

    const sessions = await find_claude_sessions_from_filesystem({ session_file })
    const agent = sessions.find((s) => s.session_id === 'agent-sub-1')
    expect(agent, 'agent session returned').to.exist
    expect(agent.parse_mode).to.equal('delta')
  })
})
