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

  it('should redact freeform message.metadata while preserving structural fields', () => {
    const thread = {
      thread_id: 't4',
      timeline: [
        {
          id: 'e4',
          timestamp: 't',
          type: 'message',
          role: 'assistant',
          content: 'hi',
          metadata: {
            model: 'claude-opus-4-7',
            request_id: 'req_123',
            usage: { input_tokens: 10, output_tokens: 20 },
            stop_reason: 'end_turn',
            is_meta: false,
            level: 'warning',
            git_branch: 'feature/private-customer-acme-merge',
            custom_field: 'contact alice@example.com'
          }
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const entry = redacted.timeline[0]

    expect(entry.metadata.model).to.equal('claude-opus-4-7')
    expect(entry.metadata.request_id).to.equal('req_123')
    expect(entry.metadata.usage).to.deep.equal({
      input_tokens: 10,
      output_tokens: 20
    })
    expect(entry.metadata.stop_reason).to.equal('end_turn')
    expect(entry.metadata.is_meta).to.equal(false)
    expect(entry.metadata.level).to.equal('warning')
    expect(entry.metadata.git_branch).to.not.include('private-customer-acme')
    expect(entry.metadata.custom_field).to.not.include('alice@example.com')
  })

  it('should redact block.metadata and url-like fields on message array content', () => {
    const thread = {
      thread_id: 't5',
      timeline: [
        {
          id: 'e5',
          timestamp: 't',
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'image',
              content: '',
              url: 'https://example.com/private/alice.png',
              source: '/home/alice/secrets.png',
              metadata: { caption: 'note from alice@example.com' }
            },
            {
              type: 'text',
              content: 'hello alice@example.com'
            }
          ]
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const block = redacted.timeline[0].content[0]
    const text_block = redacted.timeline[0].content[1]

    expect(block.type).to.equal('image')
    expect(block.url).to.not.include('alice')
    expect(block.source).to.not.include('alice')
    expect(block.metadata.caption).to.not.include('alice@example.com')
    expect(text_block.content).to.not.include('alice@example.com')
  })

  it('should redact array-shaped tool_result.result element-by-element', () => {
    const thread = {
      thread_id: 't6',
      timeline: [
        {
          id: 'e6',
          timestamp: 't',
          type: 'tool_result',
          content: {
            tool_call_id: 'tc-6',
            result: [
              'string result with alice@example.com',
              { note: 'contact bob@example.com' },
              ['nested alice@example.com', { inner: 'carol@example.com' }],
              42,
              true,
              null
            ]
          }
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const result = redacted.timeline[0].content.result

    expect(result[0]).to.not.include('alice@example.com')
    expect(result[1].note).to.not.include('bob@example.com')
    expect(result[2]).to.be.an('object')
    expect(JSON.stringify(result[2])).to.not.include('alice@example.com')
    expect(JSON.stringify(result[2])).to.not.include('carol@example.com')
    expect(result[3]).to.equal(42)
    expect(result[4]).to.equal(true)
    expect(result[5]).to.equal(null)
  })

  it('should redact object tool_result.error fields when .message is absent', () => {
    const thread = {
      thread_id: 't7',
      timeline: [
        {
          id: 'e7',
          timestamp: 't',
          type: 'tool_result',
          content: {
            tool_call_id: 'tc-7',
            error: {
              code: 'E_FETCH',
              details: 'failed contacting alice@example.com',
              stack: 'at do_thing alice@example.com:42'
            }
          }
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const error = redacted.timeline[0].content.error

    expect(error.code).to.not.include('E_FETCH')
    expect(error.details).to.not.include('alice@example.com')
    expect(error.stack).to.not.include('alice@example.com')
  })

  it('should still redact only .message when object tool_result.error has one', () => {
    const thread = {
      thread_id: 't7b',
      timeline: [
        {
          id: 'e7b',
          timestamp: 't',
          type: 'tool_result',
          content: {
            tool_call_id: 'tc-7b',
            error: {
              message: 'boom alice@example.com',
              code: 'E_FETCH'
            }
          }
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const error = redacted.timeline[0].content.error

    expect(error.message).to.not.include('alice@example.com')
    expect(error.code).to.equal('E_FETCH')
  })

  it('should redact thinking.metadata', () => {
    const thread = {
      thread_id: 't8',
      timeline: [
        {
          id: 'e8',
          timestamp: 't',
          type: 'thinking',
          content: 'thinking about alice@example.com',
          metadata: { note: 'user alice@example.com' }
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const entry = redacted.timeline[0]

    expect(entry.content).to.not.include('alice@example.com')
    expect(entry.metadata.note).to.not.include('alice@example.com')
  })

  it('should cap system metadata title at 256 chars while preserving passthrough', () => {
    const long_title = 'T'.repeat(500)
    const thread = {
      thread_id: 't9',
      timeline: [
        {
          id: 'e9',
          timestamp: 't',
          type: 'system',
          system_type: 'status',
          content: 'ok',
          metadata: { title: long_title }
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const title = redacted.timeline[0].metadata.title

    expect(title.startsWith('T'.repeat(256))).to.equal(true)
    expect(title.endsWith(' [truncated]')).to.equal(true)
    expect(title.length).to.be.lessThan(long_title.length)
  })

  it('should redact context_data instead of passing through', () => {
    const thread = {
      thread_id: 't10',
      timeline: [
        {
          id: 'e10',
          timestamp: 't',
          type: 'system',
          system_type: 'configuration',
          content: 'config',
          metadata: {
            context_data: {
              repository: 'github.com/acme/private-repo',
              repo_summary: 'internal billing service for alice@example.com',
              structured_context: { note: 'contact bob@example.com' }
            }
          }
        }
      ]
    }

    const redacted = redact_thread_data(thread)
    const context_data = redacted.timeline[0].metadata.context_data

    expect(context_data).to.have.property('repository')
    expect(context_data).to.have.property('repo_summary')
    expect(context_data).to.have.property('structured_context')
    expect(context_data.repository).to.not.include('acme')
    expect(context_data.repo_summary).to.not.include('alice@example.com')
    expect(JSON.stringify(context_data.structured_context)).to.not.include(
      'bob@example.com'
    )
  })

  it('should redact freeform metadata on status system entries', () => {
    const thread = {
      thread_id: 't11',
      timeline: [
        {
          id: 'e11',
          timestamp: 't',
          type: 'system',
          system_type: 'status',
          content: 'status',
          metadata: {
            level: 'info',
            message: 'ping from alice@example.com'
          }
        }
      ]
    }

    const entry = redact_thread_data(thread).timeline[0]
    expect(entry.metadata.level).to.equal('info')
    expect(entry.metadata.message).to.not.include('alice@example.com')
  })

  it('should redact freeform metadata on configuration system entries', () => {
    const thread = {
      thread_id: 't12',
      timeline: [
        {
          id: 'e12',
          timestamp: 't',
          type: 'system',
          system_type: 'configuration',
          content: 'config change',
          metadata: {
            permission_mode: 'plan',
            description: 'switched model for alice@example.com'
          }
        }
      ]
    }

    const entry = redact_thread_data(thread).timeline[0]
    expect(entry.metadata.permission_mode).to.equal('plan')
    expect(entry.metadata.description).to.not.include('alice@example.com')
  })

  it('should redact freeform metadata on compaction system entries', () => {
    const thread = {
      thread_id: 't13',
      timeline: [
        {
          id: 'e13',
          timestamp: 't',
          type: 'system',
          system_type: 'compaction',
          content: 'compacted',
          metadata: {
            file_count: 3,
            summary: 'compacted notes from alice@example.com'
          }
        }
      ]
    }

    const entry = redact_thread_data(thread).timeline[0]
    expect(entry.metadata.file_count).to.equal(3)
    expect(entry.metadata.summary).to.not.include('alice@example.com')
  })

  it('should redact freeform metadata on branch_point system entries', () => {
    const thread = {
      thread_id: 't14',
      timeline: [
        {
          id: 'e14',
          timestamp: 't',
          type: 'system',
          system_type: 'branch_point',
          content: 'branched',
          metadata: {
            snapshot_message_id: 'snap_1',
            label: 'fork for alice@example.com'
          }
        }
      ]
    }

    const entry = redact_thread_data(thread).timeline[0]
    expect(entry.metadata.snapshot_message_id).to.equal('snap_1')
    expect(entry.metadata.label).to.not.include('alice@example.com')
  })
})
