import { expect } from 'chai'

import {
  classify_field,
  check_writable,
  _reset_violation_state_for_tests
} from '#libs-server/threads/field-ownership.mjs'
import config from '#config'

describe('libs-server/threads/field-ownership', () => {
  let original_thread_config
  let original_job_tracker
  let original_fetch

  beforeEach(() => {
    _reset_violation_state_for_tests()
    original_thread_config = config.thread_config
    original_job_tracker = config.job_tracker
    original_fetch = global.fetch
    config.thread_config = { ...(config.thread_config || {}) }
    delete config.thread_config.field_ownership_enforce
    config.job_tracker = { ...(config.job_tracker || {}) }
    delete config.job_tracker.discord_webhook_url
  })

  afterEach(() => {
    config.thread_config = original_thread_config
    config.job_tracker = original_job_tracker
    global.fetch = original_fetch
  })

  describe('classify_field', () => {
    it('returns session-owned for session lifecycle fields', () => {
      expect(classify_field('session_status')).to.equal('session-owned')
      expect(classify_field('execution')).to.equal('session-owned')
      expect(classify_field('external_session')).to.equal('session-owned')
      expect(classify_field('latest_timeline_entry')).to.equal('session-owned')
      expect(classify_field('started_at')).to.equal('session-owned')
      expect(classify_field('ended_at')).to.equal('session-owned')
      expect(classify_field('message_count')).to.equal('session-owned')
      expect(classify_field('working_directory')).to.equal('session-owned')
    })

    it('returns lifecycle for state and archive fields', () => {
      expect(classify_field('thread_state')).to.equal('lifecycle')
      expect(classify_field('archive_reason')).to.equal('lifecycle')
      expect(classify_field('archived_at')).to.equal('lifecycle')
    })

    it('returns analyzer for derived metadata fields', () => {
      expect(classify_field('title')).to.equal('analyzer')
      expect(classify_field('short_description')).to.equal('analyzer')
      expect(classify_field('tags')).to.equal('analyzer')
      expect(classify_field('relations')).to.equal('analyzer')
      expect(classify_field('prompt_properties')).to.equal('analyzer')
    })

    it('returns unknown for unmapped fields', () => {
      expect(classify_field('user_public_key')).to.equal('unknown')
      expect(classify_field('whatever')).to.equal('unknown')
    })
  })

  describe('check_writable -- exemptions', () => {
    it('allows op=create regardless of class or lease', () => {
      const result = check_writable({
        field: 'session_status',
        current_machine: 'macbook',
        lease_state: null,
        op: 'create'
      })
      expect(result).to.deep.equal({ allowed: true, reason: 'create-exempt' })
    })

    it('allows bulk_import=true regardless of class or lease', () => {
      const result = check_writable({
        field: 'execution',
        current_machine: 'macbook',
        lease_state: { machine_id: 'storage' },
        op: 'patch',
        caller_flag: { bulk_import: true }
      })
      expect(result).to.deep.equal({
        allowed: true,
        reason: 'bulk-import-exempt'
      })
    })
  })

  describe('check_writable -- session-owned class', () => {
    it('allows when lease is held locally', () => {
      const result = check_writable({
        field: 'session_status',
        current_machine: 'macbook',
        lease_state: { machine_id: 'macbook', lease_token: 1 }
      })
      expect(result.allowed).to.equal(true)
      expect(result.reason).to.equal('session-owned-with-local-lease')
    })

    it('would block in enforce mode when no lease is held', () => {
      config.thread_config.field_ownership_enforce = true
      const result = check_writable({
        field: 'session_status',
        current_machine: 'macbook',
        lease_state: null
      })
      expect(result.allowed).to.equal(false)
      expect(result.reason).to.equal('session-owned-without-local-lease')
    })

    it('would block in enforce mode when lease held by another machine', () => {
      config.thread_config.field_ownership_enforce = true
      const result = check_writable({
        field: 'execution',
        current_machine: 'macbook',
        lease_state: { machine_id: 'storage', lease_token: 1 }
      })
      expect(result.allowed).to.equal(false)
      expect(result.reason).to.equal('session-owned-without-local-lease')
    })

    it('allows but reports shadow violation when enforce mode is off', () => {
      const result = check_writable({
        field: 'session_status',
        current_machine: 'macbook',
        lease_state: { machine_id: 'storage', lease_token: 1 }
      })
      expect(result.allowed).to.equal(true)
      expect(result.reason).to.equal('shadow:session-owned-without-local-lease')
    })
  })

  describe('check_writable -- lifecycle class', () => {
    it('allows lifecycle writes when no lease is held', () => {
      const result = check_writable({
        field: 'thread_state',
        current_machine: 'macbook',
        lease_state: null
      })
      expect(result.allowed).to.equal(true)
      expect(result.reason).to.equal('lifecycle-allowed')
    })

    it('would block in enforce mode when lease held by another machine', () => {
      config.thread_config.field_ownership_enforce = true
      const result = check_writable({
        field: 'archived_at',
        current_machine: 'macbook',
        lease_state: { machine_id: 'storage', lease_token: 1 }
      })
      expect(result.allowed).to.equal(false)
      expect(result.reason).to.equal('lifecycle-redirect-to-owner')
    })
  })

  describe('check_writable -- analyzer class', () => {
    it('allows analyzer writes when no lease is held', () => {
      const result = check_writable({
        field: 'title',
        current_machine: 'storage',
        lease_state: null
      })
      expect(result.allowed).to.equal(true)
      expect(result.reason).to.equal('analyzer-allowed')
    })

    it('would block in enforce mode when held elsewhere', () => {
      config.thread_config.field_ownership_enforce = true
      const result = check_writable({
        field: 'tags',
        current_machine: 'macbook',
        lease_state: { machine_id: 'storage', lease_token: 1 }
      })
      expect(result.allowed).to.equal(false)
      expect(result.reason).to.equal('analyzer-redirect-to-owner')
    })
  })

  describe('check_writable -- unknown class', () => {
    it('allows unmapped fields with default-allow reason', () => {
      const result = check_writable({
        field: 'user_public_key',
        current_machine: 'macbook',
        lease_state: { machine_id: 'storage' }
      })
      expect(result.allowed).to.equal(true)
      expect(result.reason).to.equal('unknown-class-default-allow')
    })
  })

  describe('shadow-mode telemetry', () => {
    it('fires Discord alert after 5 violations within the rolling hour', async () => {
      config.job_tracker.discord_webhook_url = 'https://example.test/webhook'
      const calls = []
      global.fetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) })
        return { ok: true, status: 204, statusText: 'No Content', text: async () => '' }
      }

      for (let i = 0; i < 5; i += 1) {
        check_writable({
          field: 'session_status',
          current_machine: 'macbook',
          lease_state: { machine_id: 'storage' }
        })
      }
      // Fetch is fire-and-forget; allow microtask to schedule
      await new Promise((resolve) => setImmediate(resolve))

      expect(calls).to.have.lengthOf(1)
      expect(calls[0].url).to.equal('https://example.test/webhook')
      expect(calls[0].body.embeds[0].title).to.match(/violations exceeding/i)
    })

    it('respects cooldown so a second burst within the hour does not refire', async () => {
      config.job_tracker.discord_webhook_url = 'https://example.test/webhook'
      const calls = []
      global.fetch = async () => {
        calls.push(true)
        return { ok: true, status: 204, statusText: 'No Content', text: async () => '' }
      }

      for (let i = 0; i < 12; i += 1) {
        check_writable({
          field: 'session_status',
          current_machine: 'macbook',
          lease_state: { machine_id: 'storage' }
        })
      }
      await new Promise((resolve) => setImmediate(resolve))
      expect(calls).to.have.lengthOf(1)
    })

    it('does not alert when no webhook URL is configured', async () => {
      let called = false
      global.fetch = async () => {
        called = true
        return { ok: true, status: 204, statusText: 'No Content', text: async () => '' }
      }
      for (let i = 0; i < 6; i += 1) {
        check_writable({
          field: 'session_status',
          current_machine: 'macbook',
          lease_state: { machine_id: 'storage' }
        })
      }
      await new Promise((resolve) => setImmediate(resolve))
      expect(called).to.equal(false)
    })
  })
})
