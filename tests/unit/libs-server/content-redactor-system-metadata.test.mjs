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
})
