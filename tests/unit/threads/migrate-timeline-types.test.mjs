import { expect } from 'chai'

import { transform_entry } from '#cli/migrate-timeline-to-5-types.mjs'
import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'

describe('migrate-timeline-to-5-types: transform_entry', () => {
  describe('state_change -> system', () => {
    it('should produce system entry with system_type="state_change"', () => {
      const input = {
        id: 'state_001',
        timestamp: '2023-01-01T00:00:00Z',
        type: 'state_change',
        content: {
          from_state: 'idle',
          to_state: 'processing',
          reason: 'model loaded'
        }
      }
      const { entry, changed } = transform_entry(input)
      expect(changed).to.equal(true)
      expect(entry.type).to.equal('system')
      expect(entry.system_type).to.equal('state_change')
      expect(entry.content).to.equal('idle -> processing: model loaded')
      expect(entry.metadata.from_state).to.equal('idle')
      expect(entry.metadata.to_state).to.equal('processing')
      expect(entry.metadata.reason).to.equal('model loaded')
      expect(entry.schema_version).to.equal(TIMELINE_SCHEMA_VERSION)
    })

    it('should omit reason suffix when no reason present', () => {
      const { entry } = transform_entry({
        id: 's2',
        timestamp: 't',
        type: 'state_change',
        content: { from_state: 'processing', to_state: 'idle' }
      })
      expect(entry.content).to.equal('processing -> idle')
      expect(entry.metadata.reason).to.be.undefined
    })
  })

  describe('thread_state_change -> system', () => {
    it('should set thread_lifecycle=true and map previous/new state fields', () => {
      const { entry, changed } = transform_entry({
        id: 't1',
        timestamp: 't',
        type: 'thread_state_change',
        previous_thread_state: 'active',
        new_thread_state: 'archived',
        reason: 'completed'
      })
      expect(changed).to.equal(true)
      expect(entry.type).to.equal('system')
      expect(entry.system_type).to.equal('state_change')
      expect(entry.metadata.thread_lifecycle).to.equal(true)
      expect(entry.metadata.from_state).to.equal('active')
      expect(entry.metadata.to_state).to.equal('archived')
      expect(entry.content).to.equal('active -> archived: completed')
      expect(entry.schema_version).to.equal(TIMELINE_SCHEMA_VERSION)
    })
  })

  describe('error -> system', () => {
    it('should format content as "[type] message" and preserve error_type in metadata', () => {
      const { entry, changed } = transform_entry({
        id: 'e1',
        timestamp: 't',
        type: 'error',
        error_type: 'api_error',
        message: 'Rate limit exceeded',
        details: { status: 429 }
      })
      expect(changed).to.equal(true)
      expect(entry.type).to.equal('system')
      expect(entry.system_type).to.equal('error')
      expect(entry.content).to.equal('[api_error] Rate limit exceeded')
      expect(entry.metadata.error_type).to.equal('api_error')
      expect(entry.metadata.message).to.equal('Rate limit exceeded')
      expect(entry.metadata.details).to.deep.equal({ status: 429 })
      expect(entry.schema_version).to.equal(TIMELINE_SCHEMA_VERSION)
    })

    it('should truncate long error messages', () => {
      const long = 'x'.repeat(10 * 1024)
      const { entry } = transform_entry({
        id: 'e2',
        timestamp: 't',
        type: 'error',
        error_type: 'fail',
        message: long
      })
      expect(entry.metadata.message.length).to.be.lessThan(long.length)
      expect(entry.metadata.message.endsWith(' [truncated]')).to.equal(true)
    })
  })

  describe('thread_main_request -> message', () => {
    it('should become role=user', () => {
      const { entry, changed } = transform_entry({
        id: 'req_1',
        timestamp: 't',
        type: 'thread_main_request',
        content: 'Hello'
      })
      expect(changed).to.equal(true)
      expect(entry.type).to.equal('message')
      expect(entry.role).to.equal('user')
      expect(entry.content).to.equal('Hello')
      expect(entry.schema_version).to.equal(TIMELINE_SCHEMA_VERSION)
    })
  })

  describe('version gate (already at target)', () => {
    const v2_cases = [
      { type: 'message', role: 'user', content: 'hi' },
      {
        type: 'tool_call',
        content: { tool_name: 't', tool_parameters: {} }
      },
      {
        type: 'tool_result',
        content: { tool_call_id: 'x', result: 'ok' }
      },
      { type: 'thinking', content: 'reasoning' },
      { type: 'system', content: 'ok', system_type: 'status' }
    ]
    for (const c of v2_cases) {
      it(`passes ${c.type} through unchanged when schema_version >= target`, () => {
        const { entry, changed } = transform_entry({
          id: 'p',
          timestamp: 't',
          schema_version: TIMELINE_SCHEMA_VERSION,
          ...c
        })
        expect(changed).to.equal(false)
        expect(entry.type).to.equal(c.type)
        expect(entry.schema_version).to.equal(TIMELINE_SCHEMA_VERSION)
      })
    }

    it('version gate dominates type inference: v2 entry with legacy type passes through', () => {
      const { entry, changed } = transform_entry({
        id: 'x',
        timestamp: 't',
        type: 'state_change',
        schema_version: TIMELINE_SCHEMA_VERSION,
        content: 'preserved as-is'
      })
      expect(changed).to.equal(false)
      expect(entry.type).to.equal('state_change')
    })
  })

  describe('stamps unversioned 5-type entries', () => {
    it('stamps schema_version on a v1 message entry without changing shape', () => {
      const input = { id: 'm1', timestamp: 't', type: 'message', role: 'user', content: 'hi' }
      const { entry, changed } = transform_entry(input)
      expect(changed).to.equal(true)
      expect(entry.type).to.equal('message')
      expect(entry.role).to.equal('user')
      expect(entry.content).to.equal('hi')
      expect(entry.schema_version).to.equal(TIMELINE_SCHEMA_VERSION)
    })
  })

  describe('idempotency', () => {
    it('running transform twice on old entries yields same result', () => {
      const input = {
        id: 'e1',
        timestamp: 't',
        type: 'error',
        error_type: 'api_error',
        message: 'boom'
      }
      const pass1 = transform_entry(input).entry
      const pass2 = transform_entry(pass1)
      expect(pass2.changed).to.equal(false)
      expect(pass2.entry).to.deep.equal(pass1)
    })
  })

  describe('preservation', () => {
    it('preserves id, timestamp, provider_data, ordering', () => {
      const { entry } = transform_entry({
        id: 's1',
        timestamp: '2023-01-01T00:00:00Z',
        type: 'state_change',
        content: { from_state: 'a', to_state: 'b' },
        provider_data: { original: true },
        ordering: { sequence: 5 }
      })
      expect(entry.id).to.equal('s1')
      expect(entry.timestamp).to.equal('2023-01-01T00:00:00Z')
      expect(entry.provider_data).to.deep.equal({ original: true })
      expect(entry.ordering).to.deep.equal({ sequence: 5 })
    })
  })
})
