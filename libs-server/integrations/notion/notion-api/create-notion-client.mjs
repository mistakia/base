/**
 * Create and configure Notion client with retry capabilities
 */

import { Client } from '@notionhq/client'
import debug from 'debug'
import config from '#config'

const log = debug('integrations:notion:client')
const log_retry = debug('integrations:notion:retry')

/**
 * Clean an ID by removing dashes (Notion API compatibility)
 * @param {string} id - The ID to clean
 * @returns {string} Cleaned ID
 */
export function clean_notion_id(id) {
  return id ? id.replace(/-/g, '') : id
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
  max_retries: 3,
  initial_delay: 1000,
  max_delay: 30000,
  backoff_factor: 2,
  retryable_errors: [
    'RequestTimeoutError',
    'APITimeoutError',
    'NetworkError',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'notionhq_client_request_timeout',
    'Request to Notion API has timed out'
  ]
}

/**
 * Check if an error is retryable
 */
function is_retryable_error(
  error,
  retryable_errors = DEFAULT_RETRY_CONFIG.retryable_errors
) {
  if (!error) return false

  const error_message = error.message || ''
  const error_code = error.code || error.name || ''

  // Check for Notion-specific timeout patterns
  if (
    error_code === 'notionhq_client_request_timeout' ||
    error_message.includes('Request to Notion API has timed out')
  ) {
    return true
  }

  return retryable_errors.some(
    (pattern) =>
      error_code.includes(pattern) ||
      error_message.includes(pattern) ||
      error_message.toLowerCase().includes('timeout') ||
      error_message.toLowerCase().includes('network')
  )
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
function calculate_retry_delay({
  attempt,
  initial_delay,
  backoff_factor,
  max_delay
}) {
  const exponential_delay = initial_delay * Math.pow(backoff_factor, attempt)
  const with_jitter = exponential_delay * (0.5 + Math.random() * 0.5)
  return Math.min(with_jitter, max_delay)
}

/**
 * Execute API call with retry logic
 */
async function execute_with_retry({ api_call, operation_name, retry_config }) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retry_config }
  let last_error = null

  for (let attempt = 0; attempt <= config.max_retries; attempt++) {
    try {
      log_retry(
        `${operation_name}: Attempt ${attempt + 1}/${config.max_retries + 1}`
      )
      const result = await api_call()
      log_retry(`${operation_name}: Succeeded on attempt ${attempt + 1}`)
      return result
    } catch (error) {
      last_error = error
      log_retry(
        `${operation_name}: Attempt ${attempt + 1} failed: ${error.message}`
      )

      if (!is_retryable_error(error, config.retryable_errors)) {
        log_retry(`${operation_name}: Error not retryable`)
        throw error
      }

      if (attempt === config.max_retries) {
        log_retry(`${operation_name}: All retries exhausted`)
        break
      }

      const delay = calculate_retry_delay({
        attempt,
        initial_delay: config.initial_delay,
        backoff_factor: config.backoff_factor,
        max_delay: config.max_delay
      })

      log_retry(`${operation_name}: Retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  const enhanced_error = new Error(
    `${operation_name} failed after ${config.max_retries + 1} attempts: ${last_error.message}`
  )
  enhanced_error.original_error = last_error
  throw enhanced_error
}

/**
 * Create authenticated Notion client
 * @param {Object} options - Client configuration options
 * @param {string} [options.notion_token] - Override API token
 * @param {number} [options.timeout_ms] - Request timeout in milliseconds
 * @returns {Client|null} Notion client instance or null if no API key
 */
export function create_notion_client(options = {}) {
  const api_key = options.notion_token || config.notion?.api_key

  if (!api_key) {
    log('Notion API key not configured')
    return null
  }

  const client_config = {
    auth: api_key,
    notionVersion: '2022-06-28' // Use stable API version
  }

  // Use Notion's built-in timeout option
  if (options.timeout_ms) {
    client_config.timeoutMs = options.timeout_ms
    log(`Notion client configured with ${options.timeout_ms}ms timeout`)
  }

  const client = new Client(client_config)

  log('Notion client created successfully')
  return client
}

/**
 * Create enhanced Notion API client with retry capabilities
 * @param {Object} options - Client configuration
 * @param {string} [options.notion_token] - API token
 * @param {number} [options.timeout_ms] - Request timeout
 * @param {Object} [options.retry_config] - Retry configuration
 * @returns {Object} Enhanced Notion client with retry wrapper
 */
export function notion_api_client(options = {}) {
  const base_client = create_notion_client(options)

  if (!base_client) {
    return null
  }

  // Return enhanced client with retry wrapper methods
  return {
    // Direct access to base client for compatibility
    _base_client: base_client,

    // Search API with retry
    search: async (params = {}) => {
      return execute_with_retry({
        api_call: () => base_client.search(params),
        operation_name: 'notion.search',
        retry_config: options.retry_config
      })
    },

    // Pages API with retry
    pages: {
      retrieve: async ({ page_id }) => {
        return execute_with_retry({
          api_call: () => base_client.pages.retrieve({ page_id }),
          operation_name: 'notion.pages.retrieve',
          retry_config: options.retry_config
        })
      },
      create: async (params) => {
        return execute_with_retry({
          api_call: () => base_client.pages.create(params),
          operation_name: 'notion.pages.create',
          retry_config: options.retry_config
        })
      },
      update: async (params) => {
        return execute_with_retry({
          api_call: () => base_client.pages.update(params),
          operation_name: 'notion.pages.update',
          retry_config: options.retry_config
        })
      }
    },

    // Databases API with retry
    databases: {
      query: async (params) => {
        return execute_with_retry({
          api_call: () => base_client.databases.query(params),
          operation_name: 'notion.databases.query',
          retry_config: options.retry_config
        })
      },
      retrieve: async ({ database_id }) => {
        return execute_with_retry({
          api_call: () => base_client.databases.retrieve({ database_id }),
          operation_name: 'notion.databases.retrieve',
          retry_config: options.retry_config
        })
      },
      create: async (params) => {
        return execute_with_retry({
          api_call: () => base_client.databases.create(params),
          operation_name: 'notion.databases.create',
          retry_config: options.retry_config
        })
      },
      update: async (params) => {
        return execute_with_retry({
          api_call: () => base_client.databases.update(params),
          operation_name: 'notion.databases.update',
          retry_config: options.retry_config
        })
      }
    },

    // Blocks API with retry
    blocks: {
      children: {
        list: async (params) => {
          return execute_with_retry({
            api_call: () => base_client.blocks.children.list(params),
            operation_name: 'notion.blocks.children.list',
            retry_config: options.retry_config
          })
        },
        append: async (params) => {
          return execute_with_retry({
            api_call: () => base_client.blocks.children.append(params),
            operation_name: 'notion.blocks.children.append',
            retry_config: options.retry_config
          })
        }
      },
      retrieve: async ({ block_id }) => {
        return execute_with_retry({
          api_call: () => base_client.blocks.retrieve({ block_id }),
          operation_name: 'notion.blocks.retrieve',
          retry_config: options.retry_config
        })
      },
      update: async (params) => {
        return execute_with_retry({
          api_call: () => base_client.blocks.update(params),
          operation_name: 'notion.blocks.update',
          retry_config: options.retry_config
        })
      },
      delete: async ({ block_id }) => {
        return execute_with_retry({
          api_call: () => base_client.blocks.delete({ block_id }),
          operation_name: 'notion.blocks.delete',
          retry_config: options.retry_config
        })
      }
    },

    // Users API with retry
    users: {
      retrieve: async ({ user_id }) => {
        return execute_with_retry({
          api_call: () => base_client.users.retrieve({ user_id }),
          operation_name: 'notion.users.retrieve',
          retry_config: options.retry_config
        })
      },
      list: async (params = {}) => {
        return execute_with_retry({
          api_call: () => base_client.users.list(params),
          operation_name: 'notion.users.list',
          retry_config: options.retry_config
        })
      }
    }
  }
}

/**
 * Get configured Notion client (singleton pattern)
 */
let _notion_client = null
let _client_options = null

export function get_notion_client(options = {}) {
  // Create new client if options changed or no client exists
  const options_changed =
    JSON.stringify(options) !== JSON.stringify(_client_options)

  if (!_notion_client || options_changed) {
    _notion_client = create_notion_client(options)
    _client_options = { ...options }
  }

  return _notion_client
}

/**
 * Get configured Notion API client with retry capabilities (singleton pattern)
 */
let _notion_api_client = null
let _api_client_options = null

export function get_notion_api_client(options = {}) {
  const options_changed =
    JSON.stringify(options) !== JSON.stringify(_api_client_options)

  if (!_notion_api_client || options_changed) {
    _notion_api_client = notion_api_client(options)
    _api_client_options = { ...options }
  }

  return _notion_api_client
}
