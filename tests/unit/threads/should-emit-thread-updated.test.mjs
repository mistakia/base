import { expect } from 'chai'

import {
  should_emit_thread_updated,
  CLIENT_RENDERED_FIELDS,
  DEDUPE_TTL_MS,
  __reset_dedupe_cache_for_tests,
  __set_dedupe_entry_for_tests
} from '#libs-server/threads/should-emit-thread-updated.mjs'

const make_payload = (overrides = {}) => ({
  thread_id: 'thread-1',
  session_status: 'active',
  thread_state: 'active',
  title: 'Some Title',
  short_description: 'desc',
  prompt_snippet: 'snippet',
  working_directory: '/repo',
  message_count: 4,
  user_message_count: 2,
  assistant_message_count: 2,
  tool_call_count: 1,
  models: ['claude-opus-4-7'],
  updated_at: '2026-04-29T16:14:33.842Z',
  ...overrides
})

describe('libs-server/threads/should-emit-thread-updated', () => {
  beforeEach(() => {
    __reset_dedupe_cache_for_tests()
  })

  it('returns true on first call for a thread and stores signature', () => {
    const payload = make_payload()
    expect(should_emit_thread_updated({ thread_id: 'thread-1', payload })).to.be
      .true
  })

  it('returns false on identical replay for same thread', () => {
    const payload = make_payload()
    should_emit_thread_updated({ thread_id: 'thread-1', payload })
    expect(should_emit_thread_updated({ thread_id: 'thread-1', payload })).to.be
      .false
  })

  for (const field of CLIENT_RENDERED_FIELDS) {
    it(`returns true when only "${field}" changes`, () => {
      const baseline = make_payload()
      should_emit_thread_updated({ thread_id: 'thread-1', payload: baseline })
      const mutated = { ...baseline }
      const current = baseline[field]
      mutated[field] = Array.isArray(current)
        ? [...current, 'extra']
        : typeof current === 'number'
          ? current + 1
          : `${current}-changed`
      expect(
        should_emit_thread_updated({ thread_id: 'thread-1', payload: mutated })
      ).to.be.true
    })
  }

  it('treats two distinct thread_ids as independent', () => {
    const payload = make_payload()
    should_emit_thread_updated({ thread_id: 'thread-1', payload })
    expect(
      should_emit_thread_updated({
        thread_id: 'thread-2',
        payload: { ...payload, thread_id: 'thread-2' }
      })
    ).to.be.true
    expect(should_emit_thread_updated({ thread_id: 'thread-1', payload })).to.be
      .false
  })

  it('emits again after the TTL expires', () => {
    const payload = make_payload()
    should_emit_thread_updated({ thread_id: 'thread-1', payload })
    __set_dedupe_entry_for_tests({
      thread_id: 'thread-1',
      signature: 'stale-signature',
      last_emit_ms: Date.now() - DEDUPE_TTL_MS - 1000
    })
    expect(should_emit_thread_updated({ thread_id: 'thread-1', payload })).to.be
      .true
  })
})
