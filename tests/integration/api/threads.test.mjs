import chai from 'chai'
import chaiHttp from 'chai-http'

import server from '#server'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread,
  authenticate_request
} from '#tests/utils/index.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'

const { expect } = chai
chai.use(chaiHttp)

describe('Threads API', () => {
  let test_user
  let test_root_base_repo

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
  })

  after(async () => {
    await reset_all_tables()
  })

  beforeEach(async () => {
    test_root_base_repo = await create_temp_test_repo({ prefix: 'base-repo-' })
  })

  afterEach(async () => {
    if (test_root_base_repo) {
      test_root_base_repo.cleanup()
    }
  })

  describe('GET /api/threads', () => {
    beforeEach(async () => {
      // Create some test threads
      await create_test_thread({
        user_id: test_user.user_id,
        state: 'active',
        root_base_repo: test_root_base_repo
      })

      await create_test_thread({
        user_id: test_user.user_id,
        state: 'paused',
        root_base_repo: test_root_base_repo
      })
    })

    it('should list all threads for a user', async () => {
      const response = await authenticate_request(
        chai.request(server).get('/api/threads'),
        test_user
      ).query({
        user_id: test_user.user_id,
        user_base_directory: test_root_base_repo.user_path
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
        user_base_directory: test_root_base_repo.user_path,
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
      // Create a test thread with a main request
      test_thread = await create_test_thread({
        user_id: test_user.user_id,
        root_base_repo: test_root_base_repo,
        initial_timeline: [
          {
            id: 'req_001',
            timestamp: new Date().toISOString(),
            type: 'thread_main_request',
            content: 'Hello, this is a test message'
          }
        ]
      })
    })

    it('should get a thread by ID', async () => {
      const response = await authenticate_request(
        chai.request(server).get(`/api/threads/${test_thread.thread_id}`),
        test_user
      ).query({ user_base_directory: test_root_base_repo.user_path })

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('object')
      expect(response.body.thread_id).to.equal(test_thread.thread_id)
      expect(response.body.user_id).to.equal(test_user.user_id)
      expect(response.body.inference_provider).to.equal('ollama')
      expect(response.body.model).to.equal('llama2')

      // Verify timeline is returned
      expect(response.body.timeline).to.be.an('array')
      expect(response.body.timeline).to.have.lengthOf(1)
      expect(response.body.timeline[0].type).to.equal('thread_main_request')
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
      await create_test_thread({
        user_id: test_user.user_id,
        state: 'active',
        root_base_repo: test_root_base_repo
      })
    })

    it('should create a new thread', async () => {
      const thread_data = {
        inference_provider: 'ollama',
        model: 'llama2',
        thread_main_request: 'Hello, this is a new thread',
        user_base_directory: test_root_base_repo.user_path,
        system_base_directory: test_root_base_repo.path
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
