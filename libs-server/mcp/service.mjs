import debug from 'debug'

const log = debug('mcp:service')

// Map of MCP providers
const providers = new Map()

/**
 * Register an MCP provider
 * @param {string} name - Provider name
 * @param {object} handler - Provider handler
 */
export function register_provider(name, handler) {
  if (!name || typeof name !== 'string') {
    throw new Error('Provider name must be a non-empty string')
  }

  if (
    !handler ||
    typeof handler !== 'object' ||
    typeof handler.handle_request !== 'function'
  ) {
    throw new Error(
      'Provider handler must be an object with a handle_request function'
    )
  }

  log(`Registering MCP provider: ${name}`)
  providers.set(name, handler)
  return true
}

/**
 * Get an MCP provider
 * @param {string} name - Provider name
 * @returns {object|null} Provider handler or null if not found
 */
export function get_provider(name) {
  return providers.get(name) || null
}

/**
 * List all registered MCP providers
 * @returns {Array} Array of provider names
 */
export function list_providers() {
  return Array.from(providers.keys())
}

/**
 * Process an MCP request
 * @param {string} provider_name - Provider name
 * @param {object} request - MCP request
 * @returns {Promise<object>} MCP response
 */
export async function process_request(provider_name, request) {
  if (!provider_name || typeof provider_name !== 'string') {
    throw new Error('Provider name must be a non-empty string')
  }

  if (!request || typeof request !== 'object') {
    throw new Error('Request must be an object')
  }

  const provider = get_provider(provider_name)

  if (!provider) {
    throw new Error(`Unknown MCP provider: ${provider_name}`)
  }

  log(`Processing request for provider: ${provider_name}`)
  log('Request: %O', request)

  try {
    // Call the provider's handler
    const response = await provider.handle_request(request)
    log('Response: %O', response)
    return response
  } catch (error) {
    log(`Error processing request: ${error.message}`)
    throw error
  }
}
