import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import crypto from 'crypto'

import {
  write_submit_correlation,
  read_submit_correlation,
  clear_submit_correlation,
  SUBMIT_CORRELATION_KEY_PREFIX,
  SUBMIT_CORRELATION_TTL_SECONDS,
  TEST_KEY_PREFIX
} from '#libs-server/threads/submit-correlation-store.mjs'
import {
  get_redis_connection,
  close_redis_connection
} from '#server/services/redis/get-connection.mjs'

const skip_if_no_redis = async () => {
  try {
    await get_redis_connection().ping()
    return false
  } catch {
    return true
  }
}

describe('submit-correlation-store', function () {
  this.timeout(5000)
  let skip = false
  let thread_id

  before(async function () {
    skip = await skip_if_no_redis()
    if (skip) this.skip()
  })

  beforeEach(() => {
    thread_id = crypto.randomUUID()
  })

  after(async () => {
    if (!skip) await close_redis_connection()
  })

  it('round-trips prompt_correlation_id and submitted_at', async () => {
    const prompt_correlation_id = crypto.randomUUID()
    const submitted_at = new Date().toISOString()
    await write_submit_correlation({
      thread_id,
      prompt_correlation_id,
      submitted_at
    })
    const result = await read_submit_correlation({ thread_id })
    expect(result).to.deep.equal({ prompt_correlation_id, submitted_at })
    await clear_submit_correlation({ thread_id })
  })

  it('clear_submit_correlation removes the key', async () => {
    await write_submit_correlation({
      thread_id,
      prompt_correlation_id: crypto.randomUUID(),
      submitted_at: new Date().toISOString()
    })
    await clear_submit_correlation({ thread_id })
    const result = await read_submit_correlation({ thread_id })
    expect(result).to.equal(null)
  })

  it('sets a TTL within range of SUBMIT_CORRELATION_TTL_SECONDS', async () => {
    await write_submit_correlation({
      thread_id,
      prompt_correlation_id: crypto.randomUUID(),
      submitted_at: new Date().toISOString()
    })
    const redis = get_redis_connection()
    const ttl = await redis.ttl(
      `${TEST_KEY_PREFIX}${SUBMIT_CORRELATION_KEY_PREFIX}${thread_id}`
    )
    expect(ttl).to.be.above(0)
    expect(ttl).to.be.at.most(SUBMIT_CORRELATION_TTL_SECONDS)
    await clear_submit_correlation({ thread_id })
  })

  it('read_submit_correlation returns null for a non-existent thread', async () => {
    const result = await read_submit_correlation({ thread_id })
    expect(result).to.equal(null)
  })

  it('writes under test: prefix in NODE_ENV=test', async () => {
    expect(process.env.NODE_ENV).to.equal('test')
    await write_submit_correlation({
      thread_id,
      prompt_correlation_id: crypto.randomUUID(),
      submitted_at: new Date().toISOString()
    })
    const redis = get_redis_connection()
    const test_value = await redis.get(
      `${TEST_KEY_PREFIX}${SUBMIT_CORRELATION_KEY_PREFIX}${thread_id}`
    )
    const non_test_value = await redis.get(
      `${SUBMIT_CORRELATION_KEY_PREFIX}${thread_id}`
    )
    expect(test_value).to.be.a('string')
    expect(non_test_value).to.equal(null)
    await clear_submit_correlation({ thread_id })
  })
})
