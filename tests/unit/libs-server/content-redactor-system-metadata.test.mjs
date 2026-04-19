import { expect } from 'chai'

import { redact_thread_data } from '#server/middleware/content-redactor.mjs'

describe('content-redactor system metadata', () => {
  it('should redact email/phone and truncate details on an error system entry', () => {
    const long_details =
      'boom '.repeat(1000) + ' contact foo@example.com or 415-555-1234'
    const thread = {
      thread_id: 't1',
      timeline: [
        {
          id: 'e1',
          timestamp: 't',
          type: 'system',
          system_type: 'error',
          content: '[api_error] something went wrong',
          metadata: {
            error_type: 'api_error',
            message: 'reach out at alice@example.com',
            details: long_details
          }
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const entry = redacted.timeline[0]

    expect(entry.system_type).to.equal('error')
    expect(entry.metadata.error_type).to.equal('api_error')
    expect(entry.metadata.message).to.not.include('alice@example.com')
    expect(entry.metadata.details).to.not.include('foo@example.com')
    expect(entry.metadata.details).to.not.include('415-555-1234')
    expect(entry.metadata.details.endsWith(' [truncated]')).to.equal(true)
    expect(entry.metadata.details.length).to.be.lessThan(long_details.length)
  })

  it('should pass through state_change structural metadata and redact reason', () => {
    const thread = {
      thread_id: 't2',
      timeline: [
        {
          id: 'e2',
          timestamp: 't',
          type: 'system',
          system_type: 'state_change',
          content: 'active -> archived: user alice@example.com finished',
          metadata: {
            from_state: 'active',
            to_state: 'archived',
            thread_lifecycle: true,
            reason: 'completed by alice@example.com (call 415-555-1234)'
          }
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const entry = redacted.timeline[0]

    expect(entry.system_type).to.equal('state_change')
    expect(entry.metadata.from_state).to.equal('active')
    expect(entry.metadata.to_state).to.equal('archived')
    expect(entry.metadata.thread_lifecycle).to.equal(true)
    expect(entry.metadata.reason).to.not.include('alice@example.com')
    expect(entry.metadata.reason).to.not.include('415-555-1234')
  })

  it('should redact bare-string error on tool_result entries', () => {
    const thread = {
      thread_id: 't3',
      timeline: [
        {
          id: 'e3',
          timestamp: 't',
          type: 'tool_result',
          content: {
            tool_call_id: 'tc-1',
            error: 'fetch failed for alice@example.com at 415-555-1234'
          }
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const entry = redacted.timeline[0]

    expect(entry.content.tool_call_id).to.equal('tc-1')
    expect(typeof entry.content.error).to.equal('string')
    expect(entry.content.error).to.not.include('alice@example.com')
    expect(entry.content.error).to.not.include('415-555-1234')
  })
})
