/**
 * Base class for inference providers
 * All inference providers must extend this class and implement its methods
 */

import debug from 'debug'

const log = debug('inference-providers')
export class InferenceProvider {
  constructor() {
    this.display_name = 'Base Provider'
  }

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

  /**
   * Generate a text completion
   * @param {Object} params Parameters for completion generation
   * @returns {Promise<Object|ReadableStream>} Response object or stream
   */
  async generate(params) {
    throw new Error('Method not implemented: generate')
  }

  /**
   * Generate a text completion with enhanced streaming
   * @param {Object} params Parameters for completion generation
   * @returns {Promise<ReadableStream>} A ReadableStream of structured objects
   */
  async generate_stream({ model, prompt, options = {} }) {
    // Default implementation calls regular generate and transforms the output
    // Provider-specific implementations should override this for better efficiency
    const response = await this.generate({
      model,
      prompt,
      stream: true,
      ...options
    })

    // Transform the stream using the built-in method
    return this.create_enhanced_stream(response)
  }

  /**
   * Create a ReadableStream from a JSON stream iterator
   * @param {AsyncGenerator} json_stream - The JSON stream
   * @returns {ReadableStream} - A ReadableStream of JSON string chunks
   */
  create_json_stream(json_stream) {
    return new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await json_stream.next()

          if (done) {
            controller.close()
            return
          }

          controller.enqueue(JSON.stringify(value) + '\n')
        } catch (error) {
          controller.error(error)
        }
      },
      cancel() {
        // No direct way to cancel the async iterator
      }
    })
  }

  /**
   * Create an enhanced stream with structured data
   * @param {ReadableStream} stream Original response stream
   * @returns {ReadableStream} Stream with structured data
   */
  create_enhanced_stream(stream) {
    let buffer = ''
    let current_tool_calls = []
    let tool_call_id_counter = 0

    const process_chunk = (chunk) => {
      // Parse the JSON chunk if it's a string
      let parsed_chunk
      if (typeof chunk === 'string') {
        try {
          parsed_chunk = JSON.parse(chunk)
        } catch (e) {
          // If not valid JSON, treat the chunk as text
          parsed_chunk = { text: chunk }
        }
      } else {
        parsed_chunk = chunk
      }

      // Extract text content from the chunk
      const chunk_text =
        parsed_chunk.response || parsed_chunk.content || parsed_chunk.text || ''

      // Add to buffer
      buffer += chunk_text

      // Find tool calls in the accumulated text
      const { tool_calls, next_id } = this.find_tool_calls(
        buffer,
        tool_call_id_counter
      )
      tool_call_id_counter = next_id

      // Process tool calls
      let new_tool_calls = []
      if (tool_calls.length > 0) {
        new_tool_calls = tool_calls.filter(
          (tc) => !current_tool_calls.some((ctc) => ctc.id === tc.id)
        )
        current_tool_calls = [...current_tool_calls, ...new_tool_calls]
      }

      // Create formatted text with tool call placeholders
      let formatted_text = buffer
      if (current_tool_calls.length > 0) {
        // Replace tool call text with placeholders
        formatted_text = buffer

        // Find all tool call patterns
        // Check for both ```tool_call and JSON bracket formats
        const tool_call_regex =
          /```tool_call\s*([\s\S]*?)```|\{([^{}]*)\}|\[\[([^[]*)\]\]/g
        let match
        let last_index = 0
        const formatted_parts = []

        // Reset regex
        tool_call_regex.lastIndex = 0

        while ((match = tool_call_regex.exec(buffer)) !== null) {
          const match_text = match[0]
          const tool_call_text = match[1] || match[2] || match[3]

          try {
            // Try to parse as JSON
            const tool_data = JSON.parse(
              match[1] ? match[1] : `{${tool_call_text}}`
            )

            // Check if it looks like a tool call
            if (tool_data.name || tool_data.tool) {
              const tool_name = tool_data.name || tool_data.tool

              // Add text before the tool call
              formatted_parts.push(buffer.substring(last_index, match.index))

              // Add tool call placeholder
              formatted_parts.push(`[TOOL: ${tool_name}]`)

              // Update last index
              last_index = match.index + match_text.length
            }
          } catch (e) {
            // Not a valid tool call, continue
            log(`Failed to parse tool call in response formatting - this may indicate malformed tool call: ${e.message}`)
          }
        }

        // Add the remaining text
        if (last_index < buffer.length) {
          formatted_parts.push(buffer.substring(last_index))
        }

        // Join all parts
        formatted_text = formatted_parts.join('')
      }

      // Return the enhanced chunk
      return {
        full_text: buffer,
        formatted_text,
        text: chunk_text,
        tool_calls: current_tool_calls,
        done: parsed_chunk.done || false
      }
    }

    // Create and return the transform stream
    const transform_stream = this.create_transform_stream(process_chunk)
    return stream.pipeThrough(transform_stream)
  }

  /**
   * Parse a Node.js ReadableStream into JSON objects
   * @param {NodeJS.ReadableStream} stream - The Node.js stream to parse
   * @returns {AsyncGenerator<any>} - The parsed JSON objects
   */
  // eslint-disable-next-line generator-star-spacing
  async *parse_json_stream(stream) {
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    // Process Node.js stream
    for await (const chunk of stream) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk)

      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        if (part.trim()) {
          try {
            yield JSON.parse(part)
          } catch (error) {
            console.warn('Invalid JSON:', part)
          }
        }
      }
    }

    // Process any remaining data in the buffer
    for (const part of buffer.split('\n').filter((p) => p.trim())) {
      try {
        yield JSON.parse(part)
      } catch (error) {
        console.warn('Invalid JSON:', part)
      }
    }
  }

  /**
   * Creates a TransformStream to process chunks
   * @param {Function} processor Function to process each chunk
   * @returns {TransformStream} A transform stream
   */
  create_transform_stream(processor) {
    return new TransformStream({
      transform(chunk, controller) {
        try {
          const result = processor(chunk)
          controller.enqueue(result)
        } catch (error) {
          // If processing fails, enqueue the original chunk with error info
          controller.enqueue({
            text: typeof chunk === 'string' ? chunk : JSON.stringify(chunk),
            error: error.message
          })
        }
      }
    })
  }

  /**
   * Find tool calls in a text using regex
   * @param {string} text Text to search for tool calls
   * @param {number} [id_counter=0] Starting ID counter
   * @returns {Object} Object with tool calls and next ID counter
   */
  find_tool_calls(text, id_counter = 0) {
    const tool_calls = []

    // Look for the ```tool_call format
    // Example:
    // ```tool_call
    // {
    //   "name": "search_web",
    //   "parameters": {
    //     "query": "latest AI developments"
    //   }
    // }
    // ```
    const tool_call_code_regex = /```tool_call\s*([\s\S]*?)```/g
    let code_match

    while ((code_match = tool_call_code_regex.exec(text)) !== null) {
      try {
        const tool_data = JSON.parse(code_match[1])
        if (tool_data.name) {
          tool_calls.push({
            id: `tool_call_${id_counter++}`,
            tool_name: tool_data.name,
            tool_parameters: tool_data.parameters || {}
          })
        }
      } catch (e) {
        // Not a valid JSON in tool call, continue
        log(`Failed to parse JSON in tool call extraction - this may indicate malformed JSON: ${e.message}`)
      }
    }

    // Also try the JSON bracket formats
    // Example: {"name": "search_web", "parameters": {"query": "latest AI developments"}}
    // Example: [["search_web", {"query": "latest AI developments"}]]
    const legacy_tool_call_regex = /\{([^{}]*)\}|\[\[([^[]*)\]\]/g
    let match

    while ((match = legacy_tool_call_regex.exec(text)) !== null) {
      const tool_call_text = match[1] || match[2]
      try {
        // Try to parse as JSON
        const tool_data = JSON.parse(`{${tool_call_text}}`)
        // Check if it looks like a tool call
        if (tool_data.name || tool_data.tool) {
          tool_calls.push({
            id: `tool_call_${id_counter++}`,
            tool_name: tool_data.name || tool_data.tool,
            tool_parameters: tool_data.parameters || {}
          })
        }
      } catch (e) {
        // Not a valid tool call, continue
      }
    }

    return { tool_calls, next_id: id_counter }
  }

  /**
   * Extract tool calls from text content
   * @param {string} text The text to parse for tool calls
   * @returns {Object} Object with text and extracted tool calls
   */
  extract_tool_calls(text) {
    const { tool_calls } = this.find_tool_calls(text)
    return { text, tool_calls }
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
