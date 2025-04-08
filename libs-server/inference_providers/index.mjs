/**
 * Base class for inference providers
 * All inference providers must extend this class and implement its methods
 */
export class InferenceProvider {
  /**
   * List available models from this provider
   * @returns {Promise<Array>} Array of available models
   */
  async list_models() {
    throw new Error('Method not implemented: list_models')
  }

  /**
   * Generate a message response for a thread
   * @param {Object} params Parameters for message generation
   * @param {string} params.thread_id Thread ID
   * @param {Array} params.messages Messages array with {role, content} objects
   * @param {string} params.model Model to use for generation
   * @param {boolean} [params.stream=false] Whether to stream the response
   * @param {Object} [params.options={}] Additional provider-specific options
   * @returns {Promise<Object|ReadableStream>} Response object or stream
   */
  async generate_message({
    thread_id,
    messages,
    model,
    stream = false,
    options = {}
  }) {
    throw new Error('Method not implemented: generate_message')
  }

  /**
   * Generate embeddings for a text
   * @param {Object} params Parameters for embedding generation
   * @param {string} params.text Text to generate embeddings for
   * @param {string} params.model Model to use for generation
   * @returns {Promise<Object>} Object containing embedding array
   */
  async generate_embedding({ text, model }) {
    throw new Error('Method not implemented: generate_embedding')
  }

  /**
   * Pull (download) a model from the provider
   * @param {Object} params Parameters for model pulling
   * @param {string} params.model Model to pull
   * @returns {Promise<ReadableStream|Object>} Stream of pull progress or result object
   */
  async pull_model({ model }) {
    throw new Error('Method not implemented: pull_model')
  }

  /**
   * Get detailed information about a model
   * @param {Object} params Parameters for getting model info
   * @param {string} params.model Model to get info for
   * @returns {Promise<Object>} Model information
   */
  async get_model_info({ model }) {
    throw new Error('Method not implemented: get_model_info')
  }
}

/**
 * Registry of available inference providers
 */
class ProviderRegistry {
  constructor() {
    this.providers = new Map()
  }

  /**
   * Register a provider implementation
   * @param {string} name Provider name
   * @param {InferenceProvider} provider Provider implementation
   */
  register(name, provider) {
    if (!(provider instanceof InferenceProvider)) {
      throw new Error('Provider must be an instance of InferenceProvider')
    }
    this.providers.set(name, provider)
  }

  /**
   * Get a provider by name
   * @param {string} name Provider name
   * @returns {InferenceProvider} Provider implementation
   */
  get(name) {
    const provider = this.providers.get(name)
    if (!provider) {
      throw new Error(`Provider not found: ${name}`)
    }
    return provider
  }

  /**
   * List all registered providers
   * @returns {Array<string>} Array of provider names
   */
  list() {
    return Array.from(this.providers.keys())
  }
}

// Create and export the registry singleton
export const provider_registry = new ProviderRegistry()

// Function to get a provider instance
export function get_provider(name) {
  return provider_registry.get(name)
}

// Export default for convenience
export default {
  InferenceProvider,
  provider_registry,
  get_provider
}
