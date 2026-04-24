import { expect } from 'chai'

import { assert_valid_thread_metadata } from '#libs-server/threads/validate-thread-metadata.mjs'

const valid_base = () => ({
  thread_id: '123e4567-e89b-12d3-a456-426614174000',
  user_public_key:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  external_session: { provider: 'claude' },
  thread_state: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
})

describe('assert_valid_thread_metadata', () => {
  it('accepts a minimal valid record', async () => {
    await assert_valid_thread_metadata(valid_base())
  })

  it('accepts a record with a valid execution object', async () => {
    await assert_valid_thread_metadata({
      ...valid_base(),
      execution: {
        mode: 'host',
        machine_id: 'macbook',
        container_runtime: null,
        container_name: null
      }
    })
  })

  it('rejects a record missing a required field', async () => {
    const m = valid_base()
    delete m.thread_state
    let err
    try {
      await assert_valid_thread_metadata(m)
    } catch (e) {
      err = e
    }
    expect(err).to.exist
    expect(err.code).to.equal('THREAD_METADATA_SCHEMA_VIOLATION')
    expect(err.message).to.match(/thread_state/)
  })

  it('rejects an unknown top-level field', async () => {
    let err
    try {
      await assert_valid_thread_metadata({ ...valid_base(), wat: true })
    } catch (e) {
      err = e
    }
    expect(err).to.exist
    expect(err.code).to.equal('THREAD_METADATA_SCHEMA_VIOLATION')
  })

  it('rejects a malformed execution object', async () => {
    let err
    try {
      await assert_valid_thread_metadata({
        ...valid_base(),
        execution: { mode: 'wat' }
      })
    } catch (e) {
      err = e
    }
    expect(err).to.exist
    expect(err.code).to.equal('THREAD_METADATA_SCHEMA_VIOLATION')
  })
})
