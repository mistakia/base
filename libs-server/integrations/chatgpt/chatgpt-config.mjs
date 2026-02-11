/**
 * ChatGPT Integration Configuration
 *
 * Configuration specific to ChatGPT integration functionality.
 */

import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

/**
 * Namespace UUID for ChatGPT conversation threads
 */
export const CHATGPT_NAMESPACE = '550e8400-e29b-41d4-a716-446655440002'

/**
 * ChatGPT API base URL
 */
export const CHATGPT_BASE_URL = 'https://chatgpt.com'

/**
 * ChatGPT API client version
 */
export const CHATGPT_CLIENT_VERSION =
  'prod-e135cee8d6cdad6f2e914fb3648a8225a161cdf7'

/**
 * ChatGPT-specific default limits and constraints
 */
export const CHATGPT_DEFAULT_LIMITS = {
  // ChatGPT conversation limits
  chatgpt_max_conversations: 100,
  chatgpt_list_limit: 10,

  // Rate limiting
  chatgpt_request_delay: 500, // ms between requests

  // Session filtering
  max_entries_default: null,
  max_conversations_default: null
}

/**
 * ChatGPT-specific default options
 */
export const CHATGPT_DEFAULT_OPTIONS = {
  // Import options
  dry_run: false,
  verbose: false,
  allow_updates: false,

  // Filtering options
  filter_conversations: null,

  // Date filtering
  from_date: null,
  to_date: null
}

/**
 * Get default configuration for ChatGPT integration
 * @param {Object} overrides - Override specific options
 * @returns {Object} Configuration object
 */
export function get_chatgpt_config(overrides = {}) {
  return {
    max_conversations: CHATGPT_DEFAULT_LIMITS.chatgpt_max_conversations,
    user_base_directory: get_user_base_directory(),
    ...CHATGPT_DEFAULT_OPTIONS,
    ...overrides
  }
}

/**
 * Validate required authentication for ChatGPT
 * @param {Object} auth - Authentication object
 * @throws {Error} If required auth fields are missing
 */
export function validate_chatgpt_auth(auth) {
  const required_fields = ['bearer_token', 'session_cookies', 'device_id']

  for (const field of required_fields) {
    if (!auth[field]) {
      throw new Error(`Missing required ChatGPT authentication field: ${field}`)
    }
  }
}

/**
 * Build filter function for ChatGPT conversations
 * @param {Object} options - Filter options
 * @returns {Function|null} Filter function or null if no filtering needed
 */
export function build_chatgpt_filter(options = {}) {
  const { session_id, from_date, to_date, max_entries } = options

  if (!session_id && !from_date && !to_date && !max_entries) {
    return null
  }

  return (conversation) => {
    // Filter by specific conversation ID
    if (session_id && conversation.id !== session_id) {
      return false
    }

    // Filter by date range
    if (from_date || to_date) {
      const conv_start = conversation.create_time
      if (conv_start) {
        const start_date = new Date(conv_start * 1000) // ChatGPT uses Unix timestamp
        if (from_date && start_date < new Date(from_date)) {
          return false
        }
        if (to_date && start_date > new Date(to_date + 'T23:59:59')) {
          return false
        }
      }
    }

    return true
  }
}

export default {
  CHATGPT_BASE_URL,
  CHATGPT_CLIENT_VERSION,
  CHATGPT_DEFAULT_LIMITS,
  CHATGPT_DEFAULT_OPTIONS,
  get_chatgpt_config,
  validate_chatgpt_auth,
  build_chatgpt_filter
}
