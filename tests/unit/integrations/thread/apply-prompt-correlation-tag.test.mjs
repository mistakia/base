import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import crypto from 'crypto'

import { apply_prompt_correlation_tag } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'
import {
  write_submit_correlation,
  read_submit_correlation,
  clear_submit_correlation
} from '#libs-server/threads/submit-correlation-store.mjs'
import {
  get_redis_connection,
  close_redis_connection
} from '#server/services/redis/get-connection.mjs'

const can_use_redis = async () => {
  try {
    await get_redis_connection().ping()
    return true
  } catch {
    return false
  }
}

describe('apply_prompt_correlation_tag', function () {
  this.timeout(5000)
  let thread_id

  before(async function () {
    if (!(await can_use_redis())) this.skip()
  })

  beforeEach(async () => {
    thread_id = crypto.randomUUID()
  })

  after(async () => {
    try {
      await close_redis_connection()
    } catch {}
  })

  it('happy path: tags the first matching post-normalized user-message entry', async () => {
    const submitted_at = new Date('2026-01-01T00:00:00Z').toISOString()
    const prompt_correlation_id = crypto.randomUUID()
    await write_submit_correlation({
      thread_id,
      prompt_correlation_id,
      submitted_at
    })

    const entry = {
      id: 'A',
      type: 'message',
      role: 'user',
      timestamp: '2026-01-01T00:00:01Z'
    }
    const normalized_session = { messages: [entry] }
    const result = await apply_prompt_correlation_tag({
      thread_id,
      normalized_session
    })

    expect(result.applied).to.equal(true)
    expect(result.normalized_session).to.equal(normalized_session)
    expect(entry.prompt_correlation_id).to.equal(prompt_correlation_id)
    expect(entry.id).to.equal('A')
    // Helper does NOT clear the Redis key on its own.
    const after_key = await read_submit_correlation({ thread_id })
    expect(after_key).to.not.equal(null)

    await clear_submit_correlation({ thread_id })
  })

  it('no-handle return shape: applied=false, session unchanged', async () => {
    const normalized_session = { messages: [{ type: 'message', role: 'user' }] }
    const result = await apply_prompt_correlation_tag({
      thread_id,
      normalized_session
    })
    expect(result.applied).to.equal(false)
    expect(result.normalized_session).to.equal(normalized_session)
  })

  it('only the first matching entry is tagged', async () => {
    const submitted_at = new Date('2026-01-01T00:00:00Z').toISOString()
    const K = crypto.randomUUID()
    await write_submit_correlation({
      thread_id,
      prompt_correlation_id: K,
      submitted_at
    })
    const messages = [
      { id: 'A', type: 'message', role: 'user', timestamp: '2026-01-01T00:00:01Z' },
      { id: 'B', type: 'message', role: 'user', timestamp: '2026-01-01T00:00:02Z' }
    ]
    await apply_prompt_correlation_tag({
      thread_id,
      normalized_session: { messages }
    })
    expect(messages[0].prompt_correlation_id).to.equal(K)
    expect(messages[1].prompt_correlation_id).to.be.undefined
    await clear_submit_correlation({ thread_id })
  })

  it('does not match raw type=user shape (post-normalization shape required)', async () => {
    await write_submit_correlation({
      thread_id,
      prompt_correlation_id: crypto.randomUUID(),
      submitted_at: new Date('2026-01-01T00:00:00Z').toISOString()
    })
    const entry = {
      type: 'user',
      role: 'user',
      timestamp: '2026-01-01T00:00:01Z'
    }
    const result = await apply_prompt_correlation_tag({
      thread_id,
      normalized_session: { messages: [entry] }
    })
    expect(result.applied).to.equal(false)
    expect(entry.prompt_correlation_id).to.be.undefined
    await clear_submit_correlation({ thread_id })
  })

  it('watermark grace: 2s before submitted_at is tagged; 6s before is not', async () => {
    const submitted_at = '2026-01-01T00:00:10Z'
    const K = crypto.randomUUID()
    await write_submit_correlation({
      thread_id,
      prompt_correlation_id: K,
      submitted_at
    })
    const within_grace = {
      type: 'message',
      role: 'user',
      timestamp: '2026-01-01T00:00:08Z'
    }
    const outside_grace = {
      type: 'message',
      role: 'user',
      timestamp: '2026-01-01T00:00:04Z'
    }
    const r1 = await apply_prompt_correlation_tag({
      thread_id,
      normalized_session: { messages: [within_grace] }
    })
    expect(r1.applied).to.equal(true)
    expect(within_grace.prompt_correlation_id).to.equal(K)

    const thread_id_2 = crypto.randomUUID()
    await write_submit_correlation({
      thread_id: thread_id_2,
      prompt_correlation_id: K,
      submitted_at
    })
    const r2 = await apply_prompt_correlation_tag({
      thread_id: thread_id_2,
      normalized_session: { messages: [outside_grace] }
    })
    expect(r2.applied).to.equal(false)
    expect(outside_grace.prompt_correlation_id).to.be.undefined

    await clear_submit_correlation({ thread_id })
    await clear_submit_correlation({ thread_id: thread_id_2 })
  })

  it('null/NaN timestamps are skipped (no error)', async () => {
    await write_submit_correlation({
      thread_id,
      prompt_correlation_id: crypto.randomUUID(),
      submitted_at: new Date('2026-01-01T00:00:00Z').toISOString()
    })
    const messages = [
      { type: 'message', role: 'user', timestamp: null },
      { type: 'message', role: 'user', timestamp: 'not-a-date' }
    ]
    const result = await apply_prompt_correlation_tag({
      thread_id,
      normalized_session: { messages }
    })
    expect(result.applied).to.equal(false)
    for (const m of messages) {
      expect(m.prompt_correlation_id).to.be.undefined
    }
    await clear_submit_correlation({ thread_id })
  })

  it('no match leaves Redis intact and returns applied=false', async () => {
    const K = crypto.randomUUID()
    await write_submit_correlation({
      thread_id,
      prompt_correlation_id: K,
      submitted_at: new Date('2026-01-01T00:00:00Z').toISOString()
    })
    const result = await apply_prompt_correlation_tag({
      thread_id,
      normalized_session: { messages: [] }
    })
    expect(result.applied).to.equal(false)
    const handle = await read_submit_correlation({ thread_id })
    expect(handle?.prompt_correlation_id).to.equal(K)
    await clear_submit_correlation({ thread_id })
  })
})
