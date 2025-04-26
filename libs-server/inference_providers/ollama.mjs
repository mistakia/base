import fetch from 'node-fetch'
import debug from 'debug'
import { InferenceProvider } from './index.mjs'

const log = debug('ollama')
const OLLAMA_API_BASE_URL = 'http://127.0.0.1:11434'

/**
 * Make an API request to Ollama
 * @param {string} api_base_url - Base URL for Ollama API
 * @param {string} endpoint - API endpoint
 * @param {Object} body - Request body
 * @param {string} [method='POST'] - HTTP method
 * @returns {Promise<Response>} - Fetch response
 */
async function make_ollama_request(
  api_base_url,
  endpoint,
  body,
  method = 'POST'
) {
  const url = `${api_base_url}/api/${endpoint}`
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(url, options)

  if (!response.ok) {
    throw new Error(`Ollama API error: ${await response.text()}`)
  }

  return response
}

/**
 * Ollama inference provider implementation
 */
export default class OllamaProvider extends InferenceProvider {
  constructor(options = {}) {
    super()
    this.display_name = 'Ollama'
    this.api_base_url = options.api_base_url || OLLAMA_API_BASE_URL
  }

  /**
   * List available models from Ollama
   * @returns {Promise<Array>} Array of available models
   */
  async list_models() {
    log('Listing models')

    const response = await make_ollama_request(
      this.api_base_url,
      'tags',
      null,
      'GET'
    )
    const result = await response.json()

    return result.models
      ? result.models.map((model) => ({
          name: model.name,
          modified_at: model.modified_at
        }))
      : []
  }

  /**
   * Generate a text completion for a prompt
   * @param {Object} params Generation parameters
   * @param {string} params.model Model to use
   * @param {string} params.prompt Text prompt to complete
   * @param {string} [params.suffix] Text to append after the completion
   * @param {Array} [params.images] Array of base64-encoded images for multimodal models
   * @param {string|Object} [params.format] Response format ('json' or JSON schema)
   * @param {Object} [params.options={}] Model-specific parameters (temperature, etc.)
   * @param {string} [params.system] System message to override Modelfile
   * @param {string} [params.template] Prompt template to override Modelfile
   * @param {boolean} [params.stream=true] Whether to stream the response
   * @param {boolean} [params.raw=false] Whether to bypass prompt templating
   * @param {string} [params.keep_alive="5m"] How long to keep model loaded
   * @returns {Promise<Object|ReadableStream>} Response object or stream
   */
  async generate({
    model,
    prompt,
    suffix,
    images,
    format,
    options = {},
    system,
    template,
    stream = true,
    raw = false,
    keep_alive
  }) {
    log(`Generating completion for model ${model}`)

    const request_body = { model, prompt, stream }

    // Add optional parameters
    if (suffix) request_body.suffix = suffix
    if (images) request_body.images = images
    if (format) request_body.format = format
    if (options && Object.keys(options).length > 0)
      request_body.options = options
    if (system) request_body.system = system
    if (template) request_body.template = template
    if (raw) request_body.raw = raw
    if (keep_alive) request_body.keep_alive = keep_alive

    const response = await make_ollama_request(
      this.api_base_url,
      'generate',
      request_body
    )

    if (stream) {
      // Use the json stream helper from the base class
      const json_stream = this.parse_json_stream(response.body)
      return this.create_json_stream(json_stream)
    } else {
      return response.json()
    }
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

    const response = await make_ollama_request(
      this.api_base_url,
      'chat',
      request_body
    )

    if (stream) {
      const json_stream = this.parse_json_stream(response.body)
      return this.create_json_stream(json_stream)
    } else {
      return response.json()
    }
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

    const request_body = { model, prompt: text }
    const response = await make_ollama_request(
      this.api_base_url,
      'embeddings',
      request_body
    )

    return response.json()
  }

  /**
   * Pull a model from Ollama
   * @param {Object} params Pull parameters
   * @param {string} params.model Model to pull
   * @returns {Promise<ReadableStream>} Stream of pull progress
   */
  async pull_model({ model }) {
    log(`Pulling model ${model}`)

    const request_body = { name: model, stream: true }
    const response = await make_ollama_request(
      this.api_base_url,
      'pull',
      request_body
    )

    const json_stream = this.parse_json_stream(response.body)
    return this.create_json_stream(json_stream)
  }

  /**
   * Get model information
   * @param {Object} params Parameters
   * @param {string} params.model Model to get info for
   * @returns {Promise<Object>} Model information
   */
  async get_model_info({ model }) {
    log(`Getting info for model ${model}`)

    const request_body = { name: model }
    const response = await make_ollama_request(
      this.api_base_url,
      'show',
      request_body
    )

    return response.json()
  }

  /**
   * Generate a text completion with enhanced streaming interface
   * @param {Object} params Parameters for completion generation
   * @param {string} params.model Model to use
   * @param {string} params.prompt Text prompt to complete
   * @param {Object} [params.options={}] Additional options including Ollama-specific parameters
   * @returns {Promise<ReadableStream>} A ReadableStream of structured objects
   */
  async generate_stream({ model, prompt, options = {} }) {
    log(`Generating streaming completion for model ${model}`)

    // Extract Ollama-specific parameters from options
    const {
      suffix,
      images,
      format,
      system,
      template,
      raw = false,
      keep_alive,
      // Extract standard options, with defaults
      ...other_options
    } = options

    // Prepare the request body
    const request_body = {
      model,
      prompt,
      stream: true,
      options: other_options
    }

    // Add optional parameters
    if (suffix) request_body.suffix = suffix
    if (images) request_body.images = images
    if (format) request_body.format = format
    if (system) request_body.system = system
    if (template) request_body.template = template
    if (raw) request_body.raw = raw
    if (keep_alive) request_body.keep_alive = keep_alive

    const response = await make_ollama_request(
      this.api_base_url,
      'generate',
      request_body
    )

    // Use the base stream processing methods
    const json_stream = this.parse_json_stream(response.body)
    const raw_stream = this.create_json_stream(json_stream)

    // Create an enhanced stream with the structured format
    return this.create_enhanced_stream(raw_stream)
  }
}
