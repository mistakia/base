import { describe, it } from 'mocha'
import { expect } from 'chai'

import { build_session_filter } from '#libs-server/integrations/thread/thread-integration-shared-config.mjs'

describe('build_session_filter date fallback', () => {
  it('should use entries[0].timestamp when metadata.start_time and created_at are missing', () => {
    const filter = build_session_filter({
      from_date: '2025-06-01'
    })

    // Raw Claude session: has entries with timestamps but no metadata.start_time or created_at
    const old_session = {
      session_id: 'old-session',
      metadata: {
        file_path: '/some/path.jsonl',
        file_summaries: []
      },
      entries: [
        { timestamp: '2025-01-15T10:00:00.000Z', type: 'user' },
        { timestamp: '2025-01-15T10:01:00.000Z', type: 'assistant' }
      ]
    }

    const recent_session = {
      session_id: 'recent-session',
      metadata: {
        file_path: '/some/other-path.jsonl',
        file_summaries: []
      },
      entries: [
        { timestamp: '2025-07-01T10:00:00.000Z', type: 'user' },
        { timestamp: '2025-07-01T10:01:00.000Z', type: 'assistant' }
      ]
    }

    expect(filter(old_session)).to.be.false
    expect(filter(recent_session)).to.be.true
  })

  it('should prefer metadata.start_time over entries[0].timestamp', () => {
    const filter = build_session_filter({
      from_date: '2025-06-01'
    })

    const session = {
      session_id: 'test-session',
      metadata: {
        start_time: '2025-07-01T10:00:00.000Z'
      },
      entries: [
        // This timestamp is before from_date, but metadata.start_time should take priority
        { timestamp: '2025-01-01T10:00:00.000Z', type: 'user' }
      ]
    }

    expect(filter(session)).to.be.true
  })

  it('should use to_date with entries[0].timestamp fallback', () => {
    const filter = build_session_filter({
      to_date: '2025-03-31'
    })

    const session_in_range = {
      session_id: 'in-range',
      metadata: { file_path: '/path.jsonl' },
      entries: [{ timestamp: '2025-02-15T10:00:00.000Z', type: 'user' }]
    }

    const session_out_of_range = {
      session_id: 'out-of-range',
      metadata: { file_path: '/path.jsonl' },
      entries: [{ timestamp: '2025-06-15T10:00:00.000Z', type: 'user' }]
    }

    expect(filter(session_in_range)).to.be.true
    expect(filter(session_out_of_range)).to.be.false
  })

  it('should pass sessions when no timestamp is available at all', () => {
    const filter = build_session_filter({
      from_date: '2025-06-01'
    })

    // Session with no timestamps anywhere
    const session = {
      session_id: 'no-timestamp-session',
      metadata: { file_path: '/path.jsonl' },
      entries: [{ type: 'user' }]
    }

    // When no timestamp is found, session should pass (not be filtered out)
    expect(filter(session)).to.be.true
  })

  it('should return null filter when no filtering options provided', () => {
    const filter = build_session_filter({})
    expect(filter).to.be.null
  })
})
