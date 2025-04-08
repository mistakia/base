import fetch from 'node-fetch'
import debug from 'debug'
import { InferenceProvider } from './index.mjs'

const log = debug('ollama')
const OLLAMA_API_BASE_URL = 'http://localhost:11434'

/**
 * Ollama inference provider implementation
 */
export default class OllamaProvider extends InferenceProvider {
  constructor(options = {}) {
    super()
    this.api_base_url = options.api_base_url || OLLAMA_API_BASE_URL
  }

  /**
   * List available models from Ollama
   * @returns {Promise<Array>} Array of available models
   */
  async list_models() {
    log('Listing models')

    const response = await fetch(`${this.api_base_url}/api/tags`, {
      method: 'GET'
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${await response.text()}`)
    }

    const result = await response.json()
    return result.models
      ? result.models.map((model) => ({
          name: model.name,
          modified_at: model.modified_at
        }))
      : []
  }

  /**
   * Generate a message response for a thread
   * @param {Object} params Message generation parameters
   * @param {string} params.thread_id Thread ID
   * @param {Array} params.messages Messages array
   * @param {string} params.model Model to use
   * @param {boolean} [params.stream=false] Whether to stream the response
   * @param {Object} [params.options={}] Additional options
   * @returns {Promise<Object|ReadableStream>} Response object or stream
   */
  async generate_message({
    thread_id,
    messages,
    model,
    stream = false,
    options = {}
  }) {
    log(`Generating message for thread ${thread_id} with model ${model}`)

    // Format messages for Ollama API
    const formatted_messages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content
    }))

    const request_body = {
      model,
      messages: formatted_messages,
      stream,
      ...options
    }

    const response = await fetch(`${this.api_base_url}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request_body)
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${await response.text()}`)
    }

    if (stream) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      return new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read()

            if (done) {
              controller.close()
              return
            }

            const chunk = decoder.decode(value)
            controller.enqueue(chunk)
          } catch (error) {
            controller.error(error)
          }
        },
        cancel() {
          reader.cancel()
        }
      })
    }

    return await response.json()
  }

  /**
   * Generate embeddings for text
   * @param {Object} params Embedding parameters
   * @param {string} params.text Text to embed
   * @param {string} params.model Model to use
   * @returns {Promise<Object>} Object containing embedding
   */
  async generate_embedding({ text, model }) {
    log(`Generating embedding with model ${model}`)

    const response = await fetch(`${this.api_base_url}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt: text
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${await response.text()}`)
    }

    return await response.json()
  }

  /**
   * Pull a model from Ollama
   * @param {Object} params Pull parameters
   * @param {string} params.model Model to pull
   * @returns {Promise<ReadableStream>} Stream of pull progress
   */
  async pull_model({ model }) {
    log(`Pulling model ${model}`)

    const response = await fetch(`${this.api_base_url}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: model, stream: true })
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${await response.text()}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    return new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()

          if (done) {
            controller.close()
            return
          }

          const chunk = decoder.decode(value)
          controller.enqueue(chunk)
        } catch (error) {
          controller.error(error)
        }
      },
      cancel() {
        reader.cancel()
      }
    })
  }

  /**
   * Get model information
   * @param {Object} params Parameters
   * @param {string} params.model Model to get info for
   * @returns {Promise<Object>} Model information
   */
  async get_model_info({ model }) {
    log(`Getting info for model ${model}`)

    const response = await fetch(`${this.api_base_url}/api/show`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: model })
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${await response.text()}`)
    }

    return await response.json()
  }
}
