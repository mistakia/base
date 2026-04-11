/* global describe it after afterEach */
import chai, { expect } from 'chai'

import { request } from '#tests/utils/test-request.mjs'
import server from '#server'
import {
  remove_active_session,
  close_session_store
} from '#server/services/active-sessions/active-session-store.mjs'

chai.should()

describe('API /active-sessions', function () {
  // Allow longer timeout for Redis operations
  this.timeout(10000)

  // Fresh session id per test so tombstones from afterEach cleanup don't
  // block subsequent tests' registrations.
  let test_session_id
  let test_counter = 0
  const test_working_directory = '/tmp/test-project'
  const test_transcript_path = '/tmp/.claude/projects/test/session.jsonl'

  beforeEach(() => {
    test_counter += 1
    test_session_id = `test-api-session-${Date.now()}-${test_counter}`
  })

  afterEach(async () => {
    // Clean up test session after each test
    await remove_active_session(test_session_id)
  })

  after(async () => {
    // Close Redis connection after all tests
    await close_session_store()
  })

  describe('GET /api/active-sessions', () => {
    it('should return an array of active sessions', async () => {
      const res = await request(server).get('/api/active-sessions')

      expect(res.status).to.equal(200)
      res.body.should.be.an('array')
    })
  })

  describe('POST /api/active-sessions', () => {
    it('should register a new active session', async () => {
      const session_data = {
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      }

      const res = await request(server)
        .post('/api/active-sessions')
        .send(session_data)

      expect(res.status).to.equal(201)
      res.body.should.be.an('object')
      res.body.should.have.property('session_id', test_session_id)
      res.body.should.have.property('working_directory', test_working_directory)
      res.body.should.have.property('transcript_path', test_transcript_path)
      res.body.should.have.property('status', 'active')
      res.body.should.have.property('started_at')
      res.body.should.have.property('last_activity_at')
    })

    it('should return 400 when session_id is missing', async () => {
      const session_data = {
        working_directory: test_working_directory
      }

      const res = await request(server)
        .post('/api/active-sessions')
        .send(session_data)

      expect(res.status).to.equal(400)
      res.body.should.have.property('error')
    })
  })

  describe('GET /api/active-sessions/:session_id', () => {
    it('should return a specific active session', async () => {
      // First register a session
      await request(server).post('/api/active-sessions').send({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      // Then retrieve it
      const res = await request(server).get(
        `/api/active-sessions/${test_session_id}`
      )

      expect(res.status).to.equal(200)
      res.body.should.be.an('object')
      res.body.should.have.property('session_id', test_session_id)
    })

    it('should return 404 for non-existent session', async () => {
      const res = await request(server).get(
        '/api/active-sessions/non-existent-session-id'
      )

      expect(res.status).to.equal(404)
      res.body.should.have.property('error')
    })
  })

  describe('PUT /api/active-sessions/:session_id', () => {
    it('should update an existing active session', async () => {
      // First register a session
      await request(server).post('/api/active-sessions').send({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      // Then update it
      const update_data = {
        status: 'idle',
        thread_id: 'test-thread-123'
      }

      const res = await request(server)
        .put(`/api/active-sessions/${test_session_id}`)
        .send(update_data)

      expect(res.status).to.equal(200)
      res.body.should.be.an('object')
      res.body.should.have.property('status', 'idle')
      res.body.should.have.property('thread_id', 'test-thread-123')
    })

    it('should upsert a new session if not found', async () => {
      const new_session_id = 'upsert-api-test-' + Date.now()

      try {
        const update_data = {
          status: 'active',
          working_directory: '/tmp/upsert-test'
        }

        const res = await request(server)
          .put(`/api/active-sessions/${new_session_id}`)
          .send(update_data)

        expect(res.status).to.equal(200)
        res.body.should.be.an('object')
        res.body.should.have.property('session_id', new_session_id)
        res.body.should.have.property('status', 'active')
      } finally {
        await remove_active_session(new_session_id)
      }
    })
  })

  describe('DELETE /api/active-sessions/:session_id', () => {
    it('should remove an active session', async () => {
      // First register a session
      await request(server).post('/api/active-sessions').send({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      // Then delete it
      const res = await request(server).delete(
        `/api/active-sessions/${test_session_id}`
      )

      expect(res.status).to.equal(200)
      res.body.should.have.property('success', true)

      // Verify it's gone
      const get_res = await request(server).get(
        `/api/active-sessions/${test_session_id}`
      )

      expect(get_res.status).to.equal(404)
    })

    it('should return success even for non-existent session (idempotent)', async () => {
      // DELETE is idempotent - returns success even if session doesn't exist
      // This is important for hook-based systems where cleanup may be called multiple times
      const res = await request(server).delete(
        '/api/active-sessions/non-existent-session-id'
      )

      expect(res.status).to.equal(200)
      res.body.should.have.property('success', true)
    })
  })
})
