import chai from 'chai'
import chaiHttp from 'chai-http'

import server from '#server'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread,
  authenticate_request
} from '#tests/utils/index.mjs'

const { expect } = chai
chai.use(chaiHttp)

describe('Threads API', () => {
  let test_user
  let test_threads = []
  let test_user_base_directory
  let test_system_base_directory

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
  })

  after(async () => {
    await reset_all_tables()
    test_threads.forEach((thread) => {
      thread.cleanup()
    })
  })

  describe('GET /api/threads', () => {
    beforeEach(async () => {
      // Create some test threads
      const thread1 = await create_test_thread({
        user_id: test_user.user_id,
        state: 'active'
      })

      test_user_base_directory = thread1.user_base_directory
      test_system_base_directory = thread1.system_base_directory
      const thread2 = await create_test_thread({
        user_id: test_user.user_id,
        state: 'paused',
        user_base_directory: test_user_base_directory,
        system_base_directory: test_system_base_directory
      })

      test_threads.push(thread1, thread2)
    })

    afterEach(async () => {
      test_threads.forEach((thread) => {
        thread.cleanup()
      })
      test_threads = []
    })

    it('should list all threads for a user', async () => {
      const response = await authenticate_request(
        chai.request(server).get('/api/threads'),
        test_user
      ).query({
        user_id: test_user.user_id,
        user_base_directory: test_user_base_directory
      })

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('array')
      expect(response.body).to.have.lengthOf(2)

      // Verify thread properties
      response.body.forEach((thread) => {
        expect(thread).to.have.property('thread_id')
        expect(thread).to.have.property('user_id', test_user.user_id)
        expect(thread).to.have.property('inference_provider')
        expect(thread).to.have.property('model')
        expect(thread).to.have.property('state')
      })
    })

    it('should filter threads by state', async () => {
      const response = await authenticate_request(
        chai.request(server).get('/api/threads'),
        test_user
      ).query({
        user_id: test_user.user_id,
        user_base_directory: test_user_base_directory,
        state: 'active'
      })

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('array')
      expect(response.body).to.have.lengthOf(1)
      expect(response.body[0].state).to.equal('active')
    })

    it('should require authentication', async () => {
      const response = await chai.request(server).get('/api/threads')
      // No authentication token

      expect(response).to.have.status(401)
    })
  })

  describe('GET /api/threads/:thread_id', () => {
    let test_thread

    beforeEach(async () => {
      // Create a test thread with initial message
      test_thread = await create_test_thread({
        user_id: test_user.user_id,
        initial_timeline: [
          {
            id: 'msg_001',
            timestamp: new Date().toISOString(),
            type: 'message',
            role: 'user',
            content: 'Hello, this is a test message'
          }
        ]
      })

      test_user_base_directory = test_thread.user_base_directory

      test_threads.push(test_thread)
    })

    afterEach(async () => {
      test_threads.forEach((thread) => {
        thread.cleanup()
      })
      test_threads = []
    })

    it('should get a thread by ID', async () => {
      const response = await authenticate_request(
        chai.request(server).get(`/api/threads/${test_thread.thread_id}`),
        test_user
      ).query({ user_base_directory: test_user_base_directory })

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('object')
      expect(response.body.thread_id).to.equal(test_thread.thread_id)
      expect(response.body.user_id).to.equal(test_user.user_id)
      expect(response.body.inference_provider).to.equal('ollama')
      expect(response.body.model).to.equal('llama2')

      // Verify timeline is returned
      expect(response.body.timeline).to.be.an('array')
      expect(response.body.timeline).to.have.lengthOf(1)
      expect(response.body.timeline[0].type).to.equal('message')
      expect(response.body.timeline[0].content).to.equal(
        'Hello, this is a test message'
      )
    })

    it('should return 404 for non-existent thread', async () => {
      const response = await authenticate_request(
        chai.request(server).get('/api/threads/non-existent-thread-id'),
        test_user
      )

      expect(response).to.have.status(404)
    })

    it('should require authentication', async () => {
      const response = await chai
        .request(server)
        .get(`/api/threads/${test_thread.thread_id}`)
      // No authentication token

      expect(response).to.have.status(401)
    })
  })

  describe('POST /api/threads', () => {
    beforeEach(async () => {
      // Create some test threads
      const thread1 = await create_test_thread({
        user_id: test_user.user_id,
        state: 'active'
      })

      test_user_base_directory = thread1.user_base_directory
      test_system_base_directory = thread1.system_base_directory

      test_threads.push(thread1)
    })

    afterEach(async () => {
      test_threads.forEach((thread) => {
        thread.cleanup()
      })
      test_threads = []
    })

    it('should create a new thread', async () => {
      const thread_data = {
        inference_provider: 'ollama',
        model: 'llama2',
        initial_message: 'Hello, this is a new thread',
        user_base_directory: test_user_base_directory,
        system_base_directory: test_system_base_directory
      }

      const response = await authenticate_request(
        chai.request(server).post('/api/threads').send(thread_data),
        test_user
      )

      expect(response).to.have.status(201)
      expect(response.body).to.be.an('object')
      expect(response.body.thread_id).to.be.a('string')
      expect(response.body.user_id).to.equal(test_user.user_id)
      expect(response.body.inference_provider).to.equal('ollama')
      expect(response.body.model).to.equal('llama2')
      expect(response.body.state).to.equal('active')
    })

    it('should reject invalid thread data', async () => {
      const invalid_thread_data = {
        // Missing required fields
      }

      const response = await authenticate_request(
        chai.request(server).post('/api/threads').send(invalid_thread_data),
        test_user
      )

      expect(response).to.have.status(400)
    })

    it('should require authentication', async () => {
      const thread_data = {
        inference_provider: 'ollama',
        model: 'llama2'
      }

      const response = await chai
        .request(server)
        .post('/api/threads')
        .send(thread_data)
      // No authentication token

      expect(response).to.have.status(401)
    })
  })
})
