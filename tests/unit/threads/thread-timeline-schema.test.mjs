import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

const schema_path = path.resolve('system/text/thread-timeline-schema.json')

describe('Thread Timeline Schema Validation', () => {
  let validate

  before(async () => {
    const schema_content = await fs.readFile(schema_path, 'utf-8')
    const schema = JSON.parse(schema_content)
    validate = ajv.compile(schema.items)
  })

  describe('valid entries (one per primitive)', () => {
    it('validates a message entry', () => {
      const entry = {
        id: 'm1',
        timestamp: '2026-04-16T00:00:00Z',
        type: 'message',
        schema_version: 2,
        role: 'user',
        content: 'hello'
      }
      expect(validate(entry)).to.equal(true, JSON.stringify(validate.errors))
    })

    it('validates a tool_call entry', () => {
      const entry = {
        id: 't1',
        timestamp: '2026-04-16T00:00:00Z',
        type: 'tool_call',
        schema_version: 2,
        content: { tool_name: 'Bash', tool_parameters: { command: 'ls' } }
      }
      expect(validate(entry)).to.equal(true, JSON.stringify(validate.errors))
    })

    it('validates a tool_result entry', () => {
      const entry = {
        id: 't2',
        timestamp: '2026-04-16T00:00:00Z',
        type: 'tool_result',
        schema_version: 2,
        content: { tool_call_id: 't1', result: 'ok' }
      }
      expect(validate(entry)).to.equal(true, JSON.stringify(validate.errors))
    })

    it('validates a thinking entry', () => {
      const entry = {
        id: 'th1',
        timestamp: '2026-04-16T00:00:00Z',
        type: 'thinking',
        schema_version: 2,
        content: 'reasoning about the problem'
      }
      expect(validate(entry)).to.equal(true, JSON.stringify(validate.errors))
    })

    it('validates a system entry for every system_type', () => {
      const system_types = [
        'status',
        'state_change',
        'error',
        'configuration',
        'compaction',
        'branch_point'
      ]
      const required_metadata_by_type = {
        state_change: { from_state: 'running', to_state: 'completed' },
        error: { error_type: 'validation_error' }
      }
      for (const system_type of system_types) {
        const entry = {
          id: `s_${system_type}`,
          timestamp: '2026-04-16T00:00:00Z',
          type: 'system',
          schema_version: 2,
          system_type,
          content: 'a system message',
          metadata: required_metadata_by_type[system_type] || {}
        }
        expect(validate(entry)).to.equal(
          true,
          `${system_type}: ${JSON.stringify(validate.errors)}`
        )
      }
    })
  })

  describe('invalid entries', () => {
    it('rejects a message entry missing role', () => {
      const entry = {
        id: 'm1',
        timestamp: '2026-04-16T00:00:00Z',
        type: 'message',
        schema_version: 2,
        content: 'hello'
      }
      expect(validate(entry)).to.equal(false)
    })

    it('rejects a system entry with an unknown system_type', () => {
      const entry = {
        id: 's1',
        timestamp: '2026-04-16T00:00:00Z',
        type: 'system',
        schema_version: 2,
        system_type: 'not_a_real_type',
        content: 'bad'
      }
      expect(validate(entry)).to.equal(false)
    })

    it('rejects an entry with unknown top-level field', () => {
      const entry = {
        id: 'x1',
        timestamp: '2026-04-16T00:00:00Z',
        type: 'message',
        schema_version: 2,
        role: 'user',
        content: 'hi',
        not_a_known_field: true
      }
      expect(validate(entry)).to.equal(false)
    })

    it('rejects an unknown primitive type', () => {
      const entry = {
        id: 'x1',
        timestamp: '2026-04-16T00:00:00Z',
        type: 'legacy_type_gone_now',
        schema_version: 2
      }
      expect(validate(entry)).to.equal(false)
    })
  })
})
