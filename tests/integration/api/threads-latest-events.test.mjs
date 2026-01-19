import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'

import server from '#server'
import {
  create_test_user,
  create_test_thread,
  create_temp_test_repo,
  authenticate_request,
  reset_all_tables
} from '#tests/utils/index.mjs'

chai.use(chaiHttp)

describe('Threads Latest Events API', () => {
  let test_user
  let test_user_2
  let test_directories

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
    test_user_2 = await create_test_user()
  })

  after(async () => {
    await reset_all_tables()
  })

  beforeEach(async () => {
    const test_repo = await create_temp_test_repo({
      prefix: 'threads-latest-events-',
      register_directories: true
    })
    test_directories = {
      system_path: test_repo.system_path,
      user_path: test_repo.user_path,
      cleanup: test_repo.cleanup
    }
  })

  afterEach(async () => {
    if (test_directories) {
      test_directories.cleanup()
    }
  })

  describe('GET /api/threads/latest-events', () => {
    it('should fetch latest events for multiple threads', async () => {
      // Create threads with timeline entries
      const thread_1 = await create_test_thread({
        user_public_key: test_user.user_public_key,
        test_directories,
        initial_timeline: [
          {
            id: 'msg_001',
            timestamp: new Date().toISOString(),
            type: 'user',
            content: 'First message'
          },
          {
            id: 'msg_002',
            timestamp: new Date().toISOString(),
            type: 'assistant',
            content: 'Response message'
          }
        ]
      })

      const thread_2 = await create_test_thread({
        user_public_key: test_user.user_public_key,
        test_directories,
        initial_timeline: [
          {
            id: 'msg_003',
            timestamp: new Date().toISOString(),
            type: 'user',
            content: 'Another thread message'
          }
        ]
      })

      const response = await authenticate_request(
        chai.request(server).get('/api/threads/latest-events'),
        test_user
      ).query({
        ids: `${thread_1.thread_id},${thread_2.thread_id}`
      })

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('object')
      expect(response.body).to.have.property(thread_1.thread_id)
      expect(response.body).to.have.property(thread_2.thread_id)

      // Thread 1 should return the last non-system event (assistant message)
      expect(response.body[thread_1.thread_id]).to.be.an('object')
      expect(response.body[thread_1.thread_id].type).to.equal('assistant')
      expect(response.body[thread_1.thread_id].content).to.equal(
        'Response message'
      )

      // Thread 2 should return the user message
      expect(response.body[thread_2.thread_id]).to.be.an('object')
      expect(response.body[thread_2.thread_id].type).to.equal('user')
    })

    it('should return null for non-existent threads', async () => {
      const response = await authenticate_request(
        chai.request(server).get('/api/threads/latest-events'),
        test_user
      ).query({
        ids: 'non-existent-thread-id'
      })

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('object')
      expect(response.body['non-existent-thread-id']).to.be.null
    })

    it('should return null for threads user cannot access', async () => {
      // Create thread owned by user 2
      const private_thread = await create_test_thread({
        user_public_key: test_user_2.user_public_key,
        test_directories,
        initial_timeline: [
          {
            id: 'msg_private',
            timestamp: new Date().toISOString(),
            type: 'user',
            content: 'Private message'
          }
        ]
      })

      // User 1 tries to fetch events for user 2's thread
      const response = await authenticate_request(
        chai.request(server).get('/api/threads/latest-events'),
        test_user
      ).query({
        ids: private_thread.thread_id
      })

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('object')
      // Should return null due to permission denial
      expect(response.body[private_thread.thread_id]).to.be.null
    })

    it('should require ids parameter', async () => {
      const response = await authenticate_request(
        chai.request(server).get('/api/threads/latest-events'),
        test_user
      )

      expect(response).to.have.status(400)
      expect(response.body.error).to.include('Missing ids parameter')
    })

    it('should reject empty ids parameter', async () => {
      const response = await authenticate_request(
        chai.request(server).get('/api/threads/latest-events'),
        test_user
      ).query({
        ids: ''
      })

      expect(response).to.have.status(400)
    })

    it('should enforce max 100 thread IDs limit', async () => {
      // Generate 101 fake thread IDs
      const thread_ids = Array.from({ length: 101 }, (_, i) => `thread-${i}`)

      const response = await authenticate_request(
        chai.request(server).get('/api/threads/latest-events'),
        test_user
      ).query({
        ids: thread_ids.join(',')
      })

      expect(response).to.have.status(400)
      expect(response.body.error).to.include('Too many thread IDs')
      expect(response.body.message).to.include('100')
    })

    it('should exclude system events from latest', async () => {
      // Create thread with system event as last entry
      const thread = await create_test_thread({
        user_public_key: test_user.user_public_key,
        test_directories,
        initial_timeline: [
          {
            id: 'msg_user',
            timestamp: new Date(Date.now() - 1000).toISOString(),
            type: 'user',
            content: 'User message'
          },
          {
            id: 'msg_system',
            timestamp: new Date().toISOString(),
            type: 'system',
            content: 'System message'
          }
        ]
      })

      const response = await authenticate_request(
        chai.request(server).get('/api/threads/latest-events'),
        test_user
      ).query({
        ids: thread.thread_id
      })

      expect(response).to.have.status(200)
      // Should return the user message, not the system message
      expect(response.body[thread.thread_id]).to.be.an('object')
      expect(response.body[thread.thread_id].type).to.equal('user')
      expect(response.body[thread.thread_id].content).to.equal('User message')
    })

    it('should return null for threads with only system events', async () => {
      // Create thread with only system events
      const thread = await create_test_thread({
        user_public_key: test_user.user_public_key,
        test_directories,
        initial_timeline: [
          {
            id: 'msg_system_1',
            timestamp: new Date().toISOString(),
            type: 'system',
            content: 'System event 1'
          },
          {
            id: 'msg_system_2',
            timestamp: new Date().toISOString(),
            type: 'system',
            content: 'System event 2'
          }
        ]
      })

      const response = await authenticate_request(
        chai.request(server).get('/api/threads/latest-events'),
        test_user
      ).query({
        ids: thread.thread_id
      })

      expect(response).to.have.status(200)
      // Should return null since all events are system events
      expect(response.body[thread.thread_id]).to.be.null
    })
  })
})
