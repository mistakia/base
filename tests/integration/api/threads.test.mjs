import { expect } from 'chai'
import { request } from '#tests/utils/test-request.mjs'

import server from '#server'
import { thread_constants } from '#libs-shared'
import {
  create_test_user,
  create_test_thread,
  create_temp_test_repo,
  authenticate_request,
  reset_all_tables
} from '#tests/utils/index.mjs'
import {
  initialize_sqlite_client,
  close_sqlite_connection,
  execute_sqlite_run
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { create_sqlite_schema } from '#libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs'

describe('Threads API', () => {
  let test_user
  let test_directories

  before(async () => {
    await reset_all_tables()
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()
    test_user = await create_test_user()
  })

  after(async () => {
    await close_sqlite_connection()
    await reset_all_tables()
  })

  beforeEach(async () => {
    await execute_sqlite_run({ query: 'DELETE FROM threads' })
    const test_repo = await create_temp_test_repo({
      prefix: 'threads-base-repo-',
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

  describe('GET /api/threads', () => {
    beforeEach(async () => {
      // Create some test threads
      await create_test_thread({
        user_public_key: test_user.user_public_key,
        test_directories
      })

      await create_test_thread({
        user_public_key: test_user.user_public_key,
        thread_state: thread_constants.THREAD_STATE.ARCHIVED,
        archive_reason: thread_constants.ARCHIVE_REASON.COMPLETED,
        test_directories
      })
    })

    it('should list all threads for a user', async () => {
      const response = await authenticate_request(
        request(server).get('/api/threads'),
        test_user
      ).query({
        user_public_key: test_user.user_public_key
      })

      expect(response.status).to.equal(200)
      expect(response.body).to.be.an('array')
      expect(response.body).to.have.lengthOf(2)

      // Verify thread properties
      response.body.forEach((thread) => {
        expect(thread).to.have.property('thread_id')
        expect(thread).to.have.property(
          'user_public_key',
          test_user.user_public_key
        )
        expect(thread).to.have.property('inference_provider')
        expect(thread).to.have.property('models')
        expect(thread).to.have.property('thread_state')
      })
    })

    it('should filter threads by state', async () => {
      const response = await authenticate_request(
        request(server).get('/api/threads'),
        test_user
      ).query({
        user_public_key: test_user.user_public_key,
        thread_state: 'active'
      })

      expect(response.status).to.equal(200)
      expect(response.body).to.be.an('array')
      expect(response.body).to.have.lengthOf(1)
      expect(response.body[0].thread_state).to.equal('active')
    })
  })

  describe('GET /api/threads/:thread_id', () => {
    let test_thread

    beforeEach(async () => {
      // Create a test thread with a main request
      test_thread = await create_test_thread({
        user_public_key: test_user.user_public_key,
        test_directories,
        initial_timeline: [
          {
            id: 'req_001',
            timestamp: new Date().toISOString(),
            type: 'message',
            role: 'user',
            content: 'Hello, this is a test message'
          }
        ]
      })
    })

    it('should get a thread by ID', async () => {
      const response = await authenticate_request(
        request(server).get(`/api/threads/${test_thread.thread_id}`),
        test_user
      )

      expect(response.status).to.equal(200)
      expect(response.body).to.be.an('object')
      expect(response.body.thread_id).to.equal(test_thread.thread_id)
      expect(response.body.user_public_key).to.equal(test_user.user_public_key)
      expect(response.body.inference_provider).to.equal('ollama')
      expect(response.body.models).to.deep.equal(['llama2'])

      // Verify timeline is returned
      expect(response.body.timeline).to.be.an('array')
      expect(response.body.timeline).to.have.lengthOf(1)
      expect(response.body.timeline[0].type).to.equal('message')
      expect(response.body.timeline[0].role).to.equal('user')
      expect(response.body.timeline[0].content).to.equal(
        'Hello, this is a test message'
      )
      expect(response.body.timeline[0].schema_version).to.equal(2)
    })

    it('should return 404 for non-existent thread', async () => {
      const response = await authenticate_request(
        request(server).get('/api/threads/non-existent-thread-id'),
        test_user
      )

      expect(response.status).to.equal(404)
    })
  })

  describe('PUT /api/threads/:thread_id/state', () => {
    let test_thread

    beforeEach(async () => {
      test_thread = await create_test_thread({
        user_public_key: test_user.user_public_key,
        test_directories
      })
    })

    it('should update thread state to archived with reason', async () => {
      const update_data = {
        thread_state: thread_constants.THREAD_STATE.ARCHIVED,
        archive_reason: thread_constants.ARCHIVE_REASON.COMPLETED
      }

      const response = await authenticate_request(
        request(server)
          .put(`/api/threads/${test_thread.thread_id}/state`)
          .send(update_data),
        test_user
      )

      expect(response.status).to.equal(200)
      expect(response.body).to.be.an('object')
      expect(response.body.thread_state).to.equal('archived')
      expect(response.body.archive_reason).to.equal('completed')
      expect(response.body.archived_at).to.be.a('string')
    })

    it('should reject archived state without reason', async () => {
      const update_data = {
        thread_state: thread_constants.THREAD_STATE.ARCHIVED
        // Missing archive_reason
      }

      const response = await authenticate_request(
        request(server)
          .put(`/api/threads/${test_thread.thread_id}/state`)
          .send(update_data),
        test_user
      )

      expect(response.status).to.equal(400)
      expect(response.body.error).to.include('archive_reason')
    })

    it('should reject invalid archive reason', async () => {
      const update_data = {
        thread_state: thread_constants.THREAD_STATE.ARCHIVED,
        archive_reason: 'invalid_reason'
      }

      const response = await authenticate_request(
        request(server)
          .put(`/api/threads/${test_thread.thread_id}/state`)
          .send(update_data),
        test_user
      )

      expect(response.status).to.equal(400)
      expect(response.body.error).to.include('Invalid archive reason')
    })

    it('should update thread state from archived back to active', async () => {
      // First archive the thread
      await authenticate_request(
        request(server)
          .put(`/api/threads/${test_thread.thread_id}/state`)
          .send({
            thread_state: thread_constants.THREAD_STATE.ARCHIVED,
            archive_reason: thread_constants.ARCHIVE_REASON.USER_ABANDONED
          }),
        test_user
      )

      // Then reactivate it
      const response = await authenticate_request(
        request(server)
          .put(`/api/threads/${test_thread.thread_id}/state`)
          .send({
            thread_state: thread_constants.THREAD_STATE.ACTIVE
          }),
        test_user
      )

      expect(response.status).to.equal(200)
      expect(response.body.thread_state).to.equal('active')
      expect(response.body).to.not.have.property('archive_reason')
      expect(response.body).to.not.have.property('archived_at')
    })
  })
})
