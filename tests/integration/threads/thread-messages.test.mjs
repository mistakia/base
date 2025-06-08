import chai from 'chai'
import chaiHttp from 'chai-http'
import nock from 'nock'

import server from '#server'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread,
  authenticate_request,
  setup_api_test_registry
} from '#tests/utils/index.mjs'

const { expect } = chai
chai.use(chaiHttp)

describe('Thread Messages API', () => {
  let test_user
  let test_thread
  let test_threads = []
  let registry_cleanup
  const OLLAMA_API_BASE_URL = 'http://127.0.0.1:11434'

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    // Disable external HTTP requests
    nock.disableNetConnect()
    // But allow localhost connections to our test server
    nock.enableNetConnect('127.0.0.1')
  })

  beforeEach(async () => {
    // Create a fresh thread for each test
    test_thread = await create_test_thread({
      user_id: test_user.user_id
    })

    // Setup registry for API calls to use the thread's directories
    registry_cleanup = setup_api_test_registry(test_thread)

    test_threads.push(test_thread)
  })

  afterEach(async () => {
    nock.cleanAll()

    // Clean up registry
    if (registry_cleanup) {
      registry_cleanup()
    }

    test_threads.forEach((thread) => {
      thread.cleanup()
    })
    test_threads = []
  })

  after(async () => {
    await reset_all_tables()
    nock.enableNetConnect()
  })

  describe('POST /api/threads/:thread_id/messages', () => {
    it('should add a message without generating a response', async () => {
      const message_data = {
        content: 'Hello, this is a test message',
        generate_response: false
      }

      const response = await authenticate_request(
        chai
          .request(server)
          .post(`/api/threads/${test_thread.thread_id}/messages`)
          .send(message_data),
        test_user
      )

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('object')
      expect(response.body.thread_id).to.equal(test_thread.thread_id)

      // Verify timeline contains the new message
      expect(response.body.timeline).to.be.an('array')
      expect(response.body.timeline).to.have.lengthOf(1)
      expect(response.body.timeline[0].type).to.equal('message')
      expect(response.body.timeline[0].role).to.equal('user')
      expect(response.body.timeline[0].content).to.equal(
        'Hello, this is a test message'
      )
    })

    it('should add a message and generate a response', async () => {
      // Mock the Ollama API response
      nock(OLLAMA_API_BASE_URL)
        .post('/api/chat')
        .reply(200, {
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you today?'
          }
        })

      const message_data = {
        content: 'Hello AI, can you help me?',
        generate_response: true
      }

      const response = await authenticate_request(
        chai
          .request(server)
          .post(`/api/threads/${test_thread.thread_id}/messages`)
          .send(message_data),
        test_user
      )

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('object')
      expect(response.body.thread_id).to.equal(test_thread.thread_id)

      // Verify timeline contains both the user message and AI response
      expect(response.body.timeline).to.be.an('array')
      expect(response.body.timeline).to.have.lengthOf(2)

      // Check user message
      expect(response.body.timeline[0].type).to.equal('message')
      expect(response.body.timeline[0].role).to.equal('user')
      expect(response.body.timeline[0].content).to.equal(
        'Hello AI, can you help me?'
      )

      // Check AI response
      expect(response.body.timeline[1].type).to.equal('message')
      expect(response.body.timeline[1].role).to.equal('assistant')
      expect(response.body.timeline[1].content).to.equal(
        'Hello! How can I help you today?'
      )
    })

    it('should handle errors from the inference provider', async () => {
      // Mock an API error
      nock(OLLAMA_API_BASE_URL)
        .post('/api/chat')
        .reply(500, { error: 'Internal server error' })

      const message_data = {
        content: 'Hello AI, can you help me?',
        generate_response: true
      }

      const response = await authenticate_request(
        chai
          .request(server)
          .post(`/api/threads/${test_thread.thread_id}/messages`)
          .send(message_data),
        test_user
      )

      // The user message should be added, but with an error for the AI response
      expect(response).to.have.status(200)
      expect(response.body).to.be.an('object')

      // Verify timeline contains the user message and an error entry
      expect(response.body.timeline).to.be.an('array')
      expect(response.body.timeline).to.have.lengthOf(2)

      // Check user message
      expect(response.body.timeline[0].type).to.equal('message')
      expect(response.body.timeline[0].role).to.equal('user')

      // Check error entry
      expect(response.body.timeline[1].type).to.equal('error')
      expect(response.body.timeline[1].error_type).to.equal(
        'generate_response_failed'
      )
    })

    it('should reject invalid message data', async () => {
      const invalid_message_data = {
        // Missing content
        generate_response: true
      }

      const response = await authenticate_request(
        chai
          .request(server)
          .post(`/api/threads/${test_thread.thread_id}/messages`)
          .send(invalid_message_data),
        test_user
      )

      expect(response).to.have.status(400)
    })

    it('should require authentication', async () => {
      const message_data = {
        content: 'Hello, this is a test message'
      }

      const response = await chai
        .request(server)
        .post(`/api/threads/${test_thread.thread_id}/messages`)
        .send(message_data)
      // No authentication token

      expect(response).to.have.status(401)
    })

    it('should return 404 for non-existent thread', async () => {
      const message_data = {
        content: 'Hello, this is a test message'
      }

      const response = await authenticate_request(
        chai
          .request(server)
          .post('/api/threads/non-existent-thread-id/messages')
          .send(message_data),
        test_user
      )

      expect(response).to.have.status(404)
    })
  })
})
