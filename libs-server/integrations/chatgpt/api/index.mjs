/**
 * ChatGPT Internal API Client
 *
 * Provides access to ChatGPT's internal backend API for conversation data.
 * Handles authentication, session management, and API communication.
 */

import debug from 'debug'
import {
  CHATGPT_BASE_URL,
  CHATGPT_CLIENT_VERSION
} from '#libs-server/integrations/chatgpt/chatgpt-config.mjs'

const log = debug('integrations:chatgpt:api')

/**
 * ChatGPT API client for ChatGPT conversations
 */
export class ChatGPTApiClient {
  constructor(options = {}) {
    this.base_url = options.base_url || CHATGPT_BASE_URL
    this.bearer_token = options.bearer_token
    this.session_cookies = options.session_cookies || {}
    this.device_id = options.device_id
    this.client_version = options.client_version || CHATGPT_CLIENT_VERSION

    // Validate required authentication
    this.validate_authentication()
  }

  /**
   * Validate that required authentication components are present
   */
  validate_authentication() {
    const missing = []

    if (!this.bearer_token) missing.push('bearer_token')
    if (!this.device_id) missing.push('device_id')
    if (!this.session_cookies['__Secure-next-auth.session-token.0']) {
      missing.push('session_token.0')
    }
    if (!this.session_cookies['__Secure-next-auth.session-token.1']) {
      missing.push('session_token.1')
    }

    if (missing.length > 0) {
      throw new Error(`Missing required authentication: ${missing.join(', ')}`)
    }
  }

  /**
   * Build standard headers for API requests
   */
  build_headers(additional_headers = {}) {
    const cookie_string = Object.entries(this.session_cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')

    return {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      authorization: `Bearer ${this.bearer_token}`,
      cookie: cookie_string,
      'oai-client-version': this.client_version,
      'oai-device-id': this.device_id,
      'oai-language': 'en-US',
      referer: 'https://chatgpt.com/',
      'sec-ch-ua':
        '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      ...additional_headers
    }
  }

  /**
   * Make authenticated request to ChatGPT API
   */
  async make_request(endpoint, options = {}) {
    const url = `${this.base_url}${endpoint}`
    const headers = this.build_headers(options.headers)

    log(`Making request to ${url}`)

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body,
        ...options
      })

      if (!response.ok) {
        const error_text = await response.text()
        throw new Error(
          `API request failed: ${response.status} ${response.statusText} - ${error_text}`
        )
      }

      const data = await response.json()
      log(`Request successful: ${response.status}`)
      return data
    } catch (error) {
      log(`Request failed: ${error.message}`)
      throw error
    }
  }

  /**
   * List conversations with pagination and filtering
   */
  async list_conversations(options = {}) {
    const {
      offset = 0,
      limit = 28,
      order = 'updated',
      is_archived = false
    } = options

    const query_params = new URLSearchParams({
      offset: offset.toString(),
      limit: limit.toString(),
      order,
      is_archived: is_archived.toString()
    })

    const endpoint = `/backend-api/conversations?${query_params}`

    log(
      `Listing conversations: offset=${offset}, limit=${limit}, order=${order}`
    )

    const data = await this.make_request(endpoint)

    log(`Found ${data.items?.length || 0} conversations`)
    return data
  }

  /**
   * Get full conversation data by ID
   */
  async get_conversation(conversation_id) {
    const endpoint = `/backend-api/conversation/${conversation_id}`

    log(`Getting conversation: ${conversation_id}`)

    const data = await this.make_request(endpoint)

    log(`Retrieved conversation: ${data.title || 'Untitled'}`)
    return data
  }

  /**
   * Get all conversations with automatic pagination
   */
  async get_all_conversations(options = {}) {
    const {
      max_conversations = null,
      is_archived = false,
      order = 'updated'
    } = options

    let all_conversations = []
    let offset = 0
    const limit = 28 // Standard page size
    let has_more = true

    log(`Fetching all conversations (max: ${max_conversations || 'unlimited'})`)

    while (has_more) {
      const response = await this.list_conversations({
        offset,
        limit,
        order,
        is_archived
      })

      const conversations = response.items || []
      all_conversations = all_conversations.concat(conversations)

      log(
        `Fetched ${conversations.length} conversations (total: ${all_conversations.length})`
      )

      // Check if we should continue
      has_more = conversations.length === limit
      if (max_conversations && all_conversations.length >= max_conversations) {
        all_conversations = all_conversations.slice(0, max_conversations)
        has_more = false
      }

      offset += limit

      // Add delay between requests to be respectful
      if (has_more) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    log(`Retrieved ${all_conversations.length} total conversations`)
    return all_conversations
  }
}

/**
 * Create ChatGPT API client from authentication configuration
 */
export function create_chatgpt_client(auth_config) {
  try {
    return new ChatGPTApiClient(auth_config)
  } catch (error) {
    log(`Failed to create ChatGPT client: ${error.message}`)
    throw error
  }
}

/**
 * Extract authentication from browser session (user must provide)
 */
export function extract_auth_from_browser() {
  // This would need to be implemented by user extracting from browser
  throw new Error(`
ChatGPT authentication must be manually extracted from browser:

1. Open ChatGPT in browser and log in
2. Open Developer Tools (F12)
3. Go to Network tab and make any request
4. Copy the following from request headers:
   - Authorization: Bearer <token>
   - Cookie: <all cookies>
   - oai-device-id: <device-id>

5. Pass these values to create_chatgpt_client({
     bearer_token: 'your-jwt-token',
     session_cookies: {
       'oai-did': 'device-id',
       '__Secure-next-auth.session-token.0': 'token-part-0',
       '__Secure-next-auth.session-token.1': 'token-part-1',
       // ... other required cookies
     },
     device_id: 'your-device-id'
   })
`)
}

/**
 * Test API client connection
 */
export async function test_chatgpt_connection(client) {
  try {
    log('Testing ChatGPT API connection...')

    // Try to fetch a small number of conversations
    const response = await client.list_conversations({ limit: 1 })

    if (response.items && response.items.length >= 0) {
      log('ChatGPT API connection successful')
      return {
        success: true,
        conversation_count: response.total || response.items.length,
        message: 'Connection successful'
      }
    } else {
      throw new Error('Unexpected response format')
    }
  } catch (error) {
    log('ChatGPT API connection failed:', error.message)
    return {
      success: false,
      error: error.message,
      message: 'Connection failed'
    }
  }
}
