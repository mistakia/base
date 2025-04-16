import { expect } from 'chai'
import nock from 'nock'

import OllamaProvider from '#libs-server/inference_providers/ollama.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread
} from '#tests/utils/index.mjs'

describe('OllamaProvider', () => {
  let test_user
  let test_thread
  let ollama_provider
  const OLLAMA_API_BASE_URL = 'http://127.0.0.1:11434'

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    // Create a provider instance
    ollama_provider = new OllamaProvider()

    // Disable external HTTP requests
    nock.disableNetConnect()
    // But allow localhost connections for local testing if needed
    nock.enableNetConnect('localhost')
  })

  beforeEach(async () => {
    // Create a fresh thread for each test
    test_thread = await create_test_thread({
      user_id: test_user.user_id,
      inference_provider: 'ollama',
      model: 'llama2'
    })
  })

  afterEach(async () => {
    test_thread.cleanup()
    nock.cleanAll()
  })

  after(async () => {
    await reset_all_tables()
    nock.enableNetConnect()
  })

  describe('list_models', () => {
    it('should list available models', async () => {
      // Mock the Ollama API response
      nock(OLLAMA_API_BASE_URL)
        .get('/api/tags')
        .reply(200, {
          models: [
            { name: 'llama2', modified_at: '2023-01-01T00:00:00Z' },
            { name: 'mistral', modified_at: '2023-01-01T00:00:00Z' }
          ]
        })

      const models = await ollama_provider.list_models()

      expect(models).to.be.an('array')
      expect(models).to.have.lengthOf(2)
      expect(models[0].name).to.equal('llama2')
      expect(models[1].name).to.equal('mistral')
    })

    it('should handle API errors gracefully', async () => {
      // Mock an API error
      nock(OLLAMA_API_BASE_URL)
        .get('/api/tags')
        .reply(500, { error: 'Internal server error' })

      try {
        await ollama_provider.list_models()
        // Should not reach here
        expect.fail('Should have thrown an error for API failure')
      } catch (error) {
        expect(error).to.be.an('error')
        expect(error.message).to.include('Ollama API error')
      }
    })
  })

  describe('generate_message', () => {
    it('should generate a non-streaming response', async () => {
      const messages = [{ role: 'user', content: 'Hello, how are you?' }]

      // Mock the Ollama API response
      nock(OLLAMA_API_BASE_URL)
        .post('/api/chat')
        .reply(200, {
          message: {
            role: 'assistant',
            content:
              "I'm doing well, thank you for asking! How can I help you today?"
          }
        })

      const response = await ollama_provider.generate_message({
        thread_id: test_thread.thread_id,
        messages,
        model: 'llama2',
        stream: false
      })

      expect(response).to.be.an('object')
      expect(response.message).to.be.an('object')
      expect(response.message.role).to.equal('assistant')
      expect(response.message.content).to.be.a('string')
    })

    it('should generate a streaming response', async () => {
      // For streaming tests, we can't easily use nock
      // This requires more advanced setup or integration testing
      // TODO: Implement streaming tests
    })

    it('should handle API errors gracefully', async () => {
      const messages = [{ role: 'user', content: 'Hello, how are you?' }]

      // Mock an API error
      nock(OLLAMA_API_BASE_URL)
        .post('/api/chat')
        .reply(500, { error: 'Internal server error' })

      try {
        await ollama_provider.generate_message({
          thread_id: test_thread.thread_id,
          messages,
          model: 'llama2',
          stream: false
        })
        // Should not reach here
        expect.fail('Should have thrown an error for API failure')
      } catch (error) {
        expect(error).to.be.an('error')
        expect(error.message).to.include('Ollama API error')
      }
    })
  })

  describe('generate_embedding', () => {
    it('should generate embeddings for text', async () => {
      const text = 'Hello, world!'

      // Mock the Ollama API response
      nock(OLLAMA_API_BASE_URL)
        .post('/api/embeddings')
        .reply(200, {
          embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
        })

      const result = await ollama_provider.generate_embedding({
        text,
        model: 'llama2'
      })

      expect(result).to.be.an('object')
      expect(result.embedding).to.be.an('array')
      expect(result.embedding).to.have.lengthOf(5)
    })

    it('should handle API errors gracefully', async () => {
      const text = 'Hello, world!'

      // Mock an API error
      nock(OLLAMA_API_BASE_URL)
        .post('/api/embeddings')
        .reply(500, { error: 'Internal server error' })

      try {
        await ollama_provider.generate_embedding({
          text,
          model: 'llama2'
        })
        // Should not reach here
        expect.fail('Should have thrown an error for API failure')
      } catch (error) {
        expect(error).to.be.an('error')
        expect(error.message).to.include('Ollama API error')
      }
    })
  })
})
