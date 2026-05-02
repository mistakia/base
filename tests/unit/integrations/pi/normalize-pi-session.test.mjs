import { describe, it, beforeEach } from 'mocha'
import { expect } from 'chai'

import {
  normalize_pi_session,
  compose_pi_branch_session_id,
  clear_unsupported_tracking
} from '#libs-server/integrations/pi/normalize-pi-session.mjs'

const make_branch_input = ({
  header = { type: 'session', id: 'sess-1', version: 3 },
  branch_entries = [],
  branch_index = 0,
  total_branches = 1,
  branch_points = [],
  all_branch_session_ids = ['sess-1-branch-0']
} = {}) => ({
  header,
  branch_entries,
  entries: branch_entries,
  branch_index,
  total_branches,
  branch_points,
  all_branch_session_ids,
  parent_session_path: null,
  project_path: '/proj',
  file_path: '/tmp/x.jsonl',
  session_id: compose_pi_branch_session_id({
    header_id: header.id,
    branch_index
  })
})

describe('normalize_pi_session', () => {
  beforeEach(() => clear_unsupported_tracking())

  it('parse_mode is full', () => {
    const out = normalize_pi_session(make_branch_input({}))
    expect(out.parse_mode).to.equal('full')
  })

  it('user message lands as type=message role=user (provenance is stamped downstream by build-timeline-entries)', () => {
    const out = normalize_pi_session(
      make_branch_input({
        branch_entries: [
          { id: 'e1', parentId: null, type: 'message', role: 'user', content: 'hi', timestamp: 1 }
        ]
      })
    )
    expect(out.messages[0].type).to.equal('message')
    expect(out.messages[0].role).to.equal('user')
    expect(out.messages[0]).to.not.have.property('provenance')
  })

  it('assistant message stamps per-turn token/cost on metadata', () => {
    const out = normalize_pi_session(
      make_branch_input({
        branch_entries: [
          {
            id: 'e1',
            parentId: null,
            type: 'message',
            role: 'assistant',
            content: 'reply',
            usage: { inputTokens: 10, outputTokens: 5 },
            cost: { inputCost: 0.01, outputCost: 0.02 },
            model: 'claude-sonnet-4',
            provider: 'anthropic',
            timestamp: 2
          }
        ]
      })
    )
    const assistant = out.messages.find((m) => m.role === 'assistant')
    expect(assistant.metadata.input_tokens).to.equal(10)
    expect(assistant.metadata.output_tokens).to.equal(5)
    expect(assistant.metadata.input_cost).to.equal(0.01)
    expect(assistant.metadata.output_cost).to.equal(0.02)
  })

  it('bashExecution emits deterministic tool_call+tool_result pair', () => {
    const out = normalize_pi_session(
      make_branch_input({
        branch_entries: [
          {
            id: 'e9',
            parentId: null,
            type: 'message',
            role: 'bashExecution',
            command: 'ls -la',
            output: 'output',
            exitCode: 0,
            timestamp: 3
          }
        ]
      })
    )
    const tc = out.messages.find((m) => m.type === 'tool_call')
    const tr = out.messages.find((m) => m.type === 'tool_result')
    expect(tc.content.tool_name).to.equal('bash')
    expect(tc.content.tool_call_id).to.equal('pi-bash-e9')
    expect(tr.content.tool_call_id).to.equal('pi-bash-e9')
    expect(tr.provider_data.exit_code).to.equal(0)
  })

  it('label entries become system/status with extension_type=pi_label', () => {
    const out = normalize_pi_session(
      make_branch_input({
        branch_entries: [
          { id: 'e1', parentId: null, type: 'label', label: 'milestone-1', timestamp: 5 }
        ]
      })
    )
    const sys = out.messages[0]
    expect(sys.type).to.equal('system')
    expect(sys.system_type).to.equal('status')
    expect(sys.metadata.extension_type).to.equal('pi_label')
    expect(sys.metadata.label_text).to.equal('milestone-1')
    expect(sys.content).to.equal('milestone-1')
  })

  it('branch_summary entry maps to system/branch_point', () => {
    const out = normalize_pi_session(
      make_branch_input({
        branch_entries: [
          {
            id: 'e1',
            parentId: null,
            type: 'branch_summary',
            summary: 'Tried plan A',
            timestamp: 7
          }
        ]
      })
    )
    expect(out.messages[0].type).to.equal('system')
    expect(out.messages[0].system_type).to.equal('branch_point')
  })

  it('emits required metadata keys for branch linking', () => {
    const out = normalize_pi_session(
      make_branch_input({
        branch_index: 1,
        total_branches: 2,
        all_branch_session_ids: ['sess-1-branch-0', 'sess-1-branch-1'],
        branch_entries: [
          { id: 'e1', parentId: null, type: 'message', role: 'user', content: 'q', timestamp: 1 }
        ]
      })
    )
    expect(out.metadata.branch_index).to.equal(1)
    expect(out.metadata.total_branches).to.equal(2)
    expect(out.metadata.original_session_id).to.equal('sess-1')
    expect(out.metadata.sibling_session_ids).to.deep.equal(['sess-1-branch-0'])
  })
})
