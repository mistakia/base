import { describe, it } from 'mocha'
import { expect } from 'chai'
import path from 'path'
import fs from 'fs/promises'

import {
  normalize_pi_entry,
  normalize_pi_session,
  compute_pi_session_aggregates
} from '#libs-server/integrations/pi/normalize-pi-session.mjs'
import {
  parse_pi_jsonl,
  migrate_pi_entries
} from '#libs-server/integrations/pi/pi-session-helpers.mjs'
import { extract_all_pi_branches } from '#libs-server/integrations/pi/pi-tree.mjs'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'pi')

const fold_entry = (entries, opts) => {
  const messages = []
  let running_model = null
  let running_provider = null
  for (let index = 0; index < entries.length; index++) {
    const r = normalize_pi_entry({
      entry: entries[index],
      index,
      branch_index: 0,
      thread_id: 'thread-x',
      running_model,
      running_provider,
      ...opts
    })
    for (const m of r.messages) messages.push(m)
    running_model = r.next_running_model
    running_provider = r.next_running_provider
  }
  return messages
}

describe('normalize_pi_entry primitive', () => {
  it('user message produces one message/user with extracted text', () => {
    const messages = fold_entry([
      {
        id: 'u1',
        type: 'message',
        timestamp: '2026-01-01T00:00:00Z',
        message: { role: 'user', content: [{ type: 'text', text: 'hi' }] }
      }
    ])
    expect(messages).to.have.lengthOf(1)
    expect(messages[0].type).to.equal('message')
    expect(messages[0].role).to.equal('user')
    expect(messages[0].content).to.equal('hi')
  })

  it('model_change advances running_model and emits configuration message', () => {
    const r = normalize_pi_entry({
      entry: {
        id: 'm1',
        type: 'model_change',
        timestamp: '2026-01-01T00:00:00Z',
        modelId: 'claude-sonnet-4-6',
        provider: 'anthropic'
      },
      index: 0,
      branch_index: 0,
      thread_id: 'thread-x'
    })
    expect(r.next_running_model).to.equal('claude-sonnet-4-6')
    expect(r.next_running_provider).to.equal('anthropic')
    expect(r.messages[0].system_type).to.equal('configuration')
    expect(r.messages[0].metadata.new_model).to.equal('claude-sonnet-4-6')
    expect(r.messages[0].metadata.previous_model).to.equal(null)
  })

  it('assistant inherits running_model when entry omits model field', () => {
    const r = normalize_pi_entry({
      entry: {
        id: 'a1',
        type: 'message',
        timestamp: '2026-01-01T00:00:01Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] }
      },
      index: 1,
      branch_index: 0,
      thread_id: 'thread-x',
      running_model: 'claude-sonnet-4-6',
      running_provider: 'anthropic'
    })
    expect(r.messages[0].metadata.model).to.equal('claude-sonnet-4-6')
    expect(r.messages[0].metadata.provider).to.equal('anthropic')
    expect(r.next_running_model).to.equal('claude-sonnet-4-6')
  })

  it('session_info surfaces session_title_candidate without emitting messages', () => {
    const r = normalize_pi_entry({
      entry: { id: 's1', type: 'session_info', title: 'My Session' },
      index: 0,
      branch_index: 0,
      thread_id: 'thread-x'
    })
    expect(r.messages).to.have.lengthOf(0)
    expect(r.session_title_candidate).to.equal('My Session')
  })

  it('bashExecution emits deterministic tool_call + tool_result pair', () => {
    const messages = fold_entry([
      {
        id: 'b1',
        type: 'message',
        timestamp: '2026-01-01T00:00:00Z',
        message: { role: 'bashExecution' },
        command: 'ls -la',
        output: 'file.txt',
        exitCode: 0
      }
    ])
    expect(messages).to.have.lengthOf(2)
    expect(messages[0].type).to.equal('tool_call')
    expect(messages[0].content.tool_name).to.equal('bash')
    expect(messages[1].type).to.equal('tool_result')
    expect(messages[0].content.tool_call_id).to.equal(
      messages[1].content.tool_call_id
    )
  })

  it('returns timestamp_ms from entry timestamp', () => {
    const r = normalize_pi_entry({
      entry: {
        id: 'u1',
        type: 'message',
        timestamp: '2026-01-01T00:00:00.000Z',
        message: { role: 'user', content: 'hi' }
      },
      index: 0,
      branch_index: 0,
      thread_id: 'thread-x'
    })
    expect(r.timestamp_ms).to.equal(Date.parse('2026-01-01T00:00:00.000Z'))
  })
})

describe('compute_pi_session_aggregates equivalence', () => {
  const fixtures = ['v1-linear.jsonl', 'v2-tree.jsonl', 'v3-multi-leaf.jsonl']
  for (const filename of fixtures) {
    it(`matches normalize_pi_session aggregates byte-for-byte: ${filename}`, async () => {
      const file_path = path.join(FIXTURES, filename)
      // Confirm the fixture file is readable
      await fs.stat(file_path)
      const { header, entries } = await parse_pi_jsonl({ file_path })
      const migrated = migrate_pi_entries({ header, entries })
      const branches = extract_all_pi_branches({ entries: migrated })
      for (const branch of branches) {
        const session = normalize_pi_session({
          header,
          branch_entries: branch.entries,
          branch_index: branch.branch_index,
          total_branches: branches.length,
          all_branch_session_ids: [],
          parent_session_path: null,
          project_path: null,
          session_id: `${header.id}-branch-${branch.branch_index}`
        })
        const derived = compute_pi_session_aggregates(session.messages)
        expect(derived.aggregate_input_tokens).to.equal(
          session.metadata.aggregate_input_tokens
        )
        expect(derived.aggregate_output_tokens).to.equal(
          session.metadata.aggregate_output_tokens
        )
        expect(derived.aggregate_cache_read_tokens).to.equal(
          session.metadata.aggregate_cache_read_tokens
        )
        expect(derived.aggregate_cache_write_tokens).to.equal(
          session.metadata.aggregate_cache_write_tokens
        )
        expect(derived.aggregate_input_cost).to.equal(
          session.metadata.aggregate_input_cost
        )
        expect(derived.aggregate_output_cost).to.equal(
          session.metadata.aggregate_output_cost
        )
        expect(derived.models.sort()).to.deep.equal(
          [...session.metadata.models].sort()
        )
        expect(derived.inference_providers.sort()).to.deep.equal(
          [...session.metadata.inference_providers].sort()
        )
      }
    })
  }
})
