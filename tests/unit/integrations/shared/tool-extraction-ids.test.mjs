import { expect } from 'chai'

import {
  create_tool_call_entry,
  create_tool_result_entry
} from '#libs-server/integrations/shared/tool-extraction-utils.mjs'
import { normalize_cursor_conversation } from '#libs-server/integrations/cursor/normalize-session.mjs'

const base_call = () => ({
  parent_id: 'parent-1',
  tool_name: 'bash',
  tool_parameters: { command: 'ls' },
  tool_call_id: 'tc-1',
  timestamp: '2026-04-18T12:00:00.000Z',
  block_index: 3,
  line_number: 42,
  source_uuid: 'src-1'
})

const base_result = () => ({
  tool_call_id: 'tc-1',
  result: 'ok',
  timestamp: '2026-04-18T12:00:00.000Z',
  block_index: 3,
  line_number: 42,
  source_uuid: 'src-1'
})

describe('tool-extraction deterministic ids', () => {
  it('same (parent_id, block_index) -> same tool_call id across calls', () => {
    const a = create_tool_call_entry(base_call())
    const b = create_tool_call_entry(base_call())
    expect(a.id).to.equal(b.id)
    expect(a.id).to.equal('parent-1-tool-call-3')
  })

  it('tool_call ordering.sequence === line_number * 10000 + block_index', () => {
    const entry = create_tool_call_entry(base_call())
    expect(entry.ordering.sequence).to.equal(42 * 10000 + 3)
    expect(entry.ordering.source_uuid).to.equal('src-1')
  })

  it('tool_result ordering.sequence === line_number * 10000 + block_index', () => {
    const entry = create_tool_result_entry(base_result())
    expect(entry.ordering.sequence).to.equal(42 * 10000 + 3)
  })

  it('throws when block_index is missing on create_tool_call_entry', () => {
    const { block_index, ...rest } = base_call()
    expect(() => create_tool_call_entry(rest)).to.throw(/block_index/)
  })

  it('throws when line_number is missing on create_tool_call_entry', () => {
    const { line_number, ...rest } = base_call()
    expect(() => create_tool_call_entry(rest)).to.throw(/line_number/)
  })

  it('throws when timestamp is missing on create_tool_call_entry', () => {
    const { timestamp, ...rest } = base_call()
    expect(() => create_tool_call_entry(rest)).to.throw(/timestamp/)
  })

  it('throws when block_index is missing on create_tool_result_entry', () => {
    const { block_index, ...rest } = base_result()
    expect(() => create_tool_result_entry(rest)).to.throw(/block_index/)
  })

  it('throws when line_number is missing on create_tool_result_entry', () => {
    const { line_number, ...rest } = base_result()
    expect(() => create_tool_result_entry(rest)).to.throw(/line_number/)
  })

  it('throws when timestamp is missing on create_tool_result_entry', () => {
    const { timestamp, ...rest } = base_result()
    expect(() => create_tool_result_entry(rest)).to.throw(/timestamp/)
  })

  describe('cursor call-site smoke', () => {
    it('code_execution content_parts use composite sequence formula', () => {
      const conversation = {
        composer_id: 'cursor-conv-1',
        created_at: '2026-04-18T12:00:00.000Z',
        last_updated_at: '2026-04-18T12:00:00.000Z',
        name: 'test',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            type: 'text',
            content: 'please run code',
            timestamp: '2026-04-18T12:00:00.000Z'
          },
          {
            id: 'msg-2',
            role: 'assistant',
            type: 'text',
            timestamp: '2026-04-18T12:00:01.000Z',
            content: 'running',
            content_parts: [
              { type: 'code', language: 'python', code: 'print(1)' },
              { type: 'code', language: 'python', code: 'print(2)' }
            ]
          }
        ]
      }

      const session = normalize_cursor_conversation(conversation)
      const tool_calls = session.messages.filter((m) => m.type === 'tool_call')
      expect(tool_calls).to.have.lengthOf(2)
      const msg_index = 1 // second message
      expect(tool_calls[0].ordering.sequence).to.equal(msg_index * 10000 + 0)
      expect(tool_calls[1].ordering.sequence).to.equal(msg_index * 10000 + 1)
      expect(tool_calls[0].id).to.equal('msg-2-tool-call-0')
      expect(tool_calls[1].id).to.equal('msg-2-tool-call-1')
    })
  })
})
