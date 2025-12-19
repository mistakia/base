import { expect } from 'chai'

import {
  register_active_session,
  update_active_session,
  get_active_session,
  get_all_active_sessions,
  remove_active_session,
  get_active_session_for_thread,
  close_session_store
} from '#libs-server/active-sessions/active-session-store.mjs'

describe('active-session-store', function () {
  // Allow longer timeout for Redis operations
  this.timeout(10000)

  const test_session_id = 'test-session-' + Date.now()
  const test_working_directory = '/tmp/test-project'
  const test_transcript_path = '/tmp/.claude/projects/test/session.jsonl'

  afterEach(async () => {
    // Clean up test session after each test
    await remove_active_session(test_session_id)
  })

  after(async () => {
    // Close Redis connection after all tests
    await close_session_store()
  })

  describe('register_active_session', () => {
    it('should register a new active session with all required fields', async () => {
      const session = await register_active_session({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      expect(session).to.be.an('object')
      expect(session.session_id).to.equal(test_session_id)
      expect(session.working_directory).to.equal(test_working_directory)
      expect(session.transcript_path).to.equal(test_transcript_path)
      expect(session.status).to.equal('active')
      expect(session.thread_id).to.be.null
      expect(session.started_at).to.be.a('string')
      expect(session.last_activity_at).to.be.a('string')
    })

    it('should set timestamps correctly', async () => {
      const before_time = new Date().toISOString()

      const session = await register_active_session({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      const after_time = new Date().toISOString()

      expect(session.started_at >= before_time).to.be.true
      expect(session.started_at <= after_time).to.be.true
      expect(session.last_activity_at >= before_time).to.be.true
      expect(session.last_activity_at <= after_time).to.be.true
    })
  })

  describe('get_active_session', () => {
    it('should retrieve a registered session', async () => {
      await register_active_session({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      const session = await get_active_session(test_session_id)

      expect(session).to.be.an('object')
      expect(session.session_id).to.equal(test_session_id)
      expect(session.working_directory).to.equal(test_working_directory)
    })

    it('should return null for non-existent session', async () => {
      const session = await get_active_session('non-existent-session-id')
      expect(session).to.be.null
    })
  })

  describe('update_active_session', () => {
    it('should update an existing session status', async () => {
      await register_active_session({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      const updated = await update_active_session({
        session_id: test_session_id,
        status: 'idle'
      })

      expect(updated.status).to.equal('idle')
      expect(updated.session_id).to.equal(test_session_id)
    })

    it('should update thread_id association', async () => {
      await register_active_session({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      const test_thread_id = 'thread-123'
      const updated = await update_active_session({
        session_id: test_session_id,
        thread_id: test_thread_id
      })

      expect(updated.thread_id).to.equal(test_thread_id)
    })

    it('should update last_activity_at on each update', async () => {
      const original = await register_active_session({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      const updated = await update_active_session({
        session_id: test_session_id,
        status: 'idle'
      })

      expect(updated.last_activity_at).to.not.equal(original.last_activity_at)
      expect(updated.last_activity_at > original.last_activity_at).to.be.true
    })

    it('should upsert a new session if not found', async () => {
      const new_session_id = 'upsert-test-' + Date.now()

      try {
        const session = await update_active_session({
          session_id: new_session_id,
          status: 'active',
          working_directory: '/tmp/upsert-test'
        })

        expect(session).to.be.an('object')
        expect(session.session_id).to.equal(new_session_id)
        expect(session.status).to.equal('active')
      } finally {
        await remove_active_session(new_session_id)
      }
    })
  })

  describe('get_all_active_sessions', () => {
    const session_id_1 = 'test-session-1-' + Date.now()
    const session_id_2 = 'test-session-2-' + Date.now()

    afterEach(async () => {
      await remove_active_session(session_id_1)
      await remove_active_session(session_id_2)
    })

    it('should return all registered sessions', async () => {
      await register_active_session({
        session_id: session_id_1,
        working_directory: '/tmp/project1',
        transcript_path: '/tmp/.claude/session1.jsonl'
      })

      await register_active_session({
        session_id: session_id_2,
        working_directory: '/tmp/project2',
        transcript_path: '/tmp/.claude/session2.jsonl'
      })

      const sessions = await get_all_active_sessions()

      expect(sessions).to.be.an('array')
      expect(sessions.length).to.be.at.least(2)

      const session_ids = sessions.map((s) => s.session_id)
      expect(session_ids).to.include(session_id_1)
      expect(session_ids).to.include(session_id_2)
    })

    it('should return empty array when no sessions exist', async () => {
      // Note: Other sessions from other tests might exist
      // This test just verifies the return type
      const sessions = await get_all_active_sessions()
      expect(sessions).to.be.an('array')
    })
  })

  describe('remove_active_session', () => {
    it('should remove a registered session', async () => {
      await register_active_session({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      const result = await remove_active_session(test_session_id)
      expect(result).to.be.true

      const session = await get_active_session(test_session_id)
      expect(session).to.be.null
    })

    it('should return false for non-existent session', async () => {
      const result = await remove_active_session('non-existent-session-id')
      expect(result).to.be.false
    })
  })

  describe('get_active_session_for_thread', () => {
    it('should find session by thread_id', async () => {
      const test_thread_id = 'thread-' + Date.now()

      await register_active_session({
        session_id: test_session_id,
        working_directory: test_working_directory,
        transcript_path: test_transcript_path
      })

      await update_active_session({
        session_id: test_session_id,
        thread_id: test_thread_id
      })

      const session = await get_active_session_for_thread(test_thread_id)

      expect(session).to.be.an('object')
      expect(session.session_id).to.equal(test_session_id)
      expect(session.thread_id).to.equal(test_thread_id)
    })

    it('should return null for non-existent thread', async () => {
      const session = await get_active_session_for_thread('non-existent-thread')
      expect(session).to.be.null
    })
  })
})
