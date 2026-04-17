/**
 * ChatGPT Session Helper Functions
 *
 * Focused helper functions for ChatGPT session processing.
 * Keeps provider class small while handling specific operations.
 */

import debug from 'debug'
import { create_chatgpt_client } from './api/index.mjs'
import {
  get_chatgpt_config,
  validate_chatgpt_auth,
  CHATGPT_NAMESPACE
} from './chatgpt-config.mjs'
import { v5 as uuidv5 } from 'uuid'
import { calculate_session_counts } from '#libs-server/integrations/thread/session-count-utilities.mjs'

const log = debug('integrations:chatgpt:session-helpers')

/**
 * Find ChatGPT conversations from provided data
 * Note: ChatGPT conversations come from API and must be provided directly
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.conversations - Array of ChatGPT conversations
 * @returns {Promise<Array>} Array of raw ChatGPT conversation objects
 */
export const find_chatgpt_sessions_from_data = async ({
  conversations = []
}) => {
  log(`Processing ${conversations.length} provided ChatGPT conversations`)
  return conversations
}

/**
 * Find ChatGPT conversations from API
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.auth_options - Authentication options for ChatGPT API
 * @param {number} params.max_conversations - Maximum conversations to fetch
 * @returns {Promise<Array>} Array of raw ChatGPT conversation objects
 */
export const find_chatgpt_sessions_from_api = async ({
  auth_options = {},
  max_conversations
}) => {
  const config = get_chatgpt_config({ max_conversations, ...auth_options })
  const { bearer_token, session_cookies, device_id, client_version } = config

  log('Finding ChatGPT conversations from API')

  // Validate authentication
  validate_chatgpt_auth({ bearer_token, session_cookies, device_id })

  const client = create_chatgpt_client({
    bearer_token,
    session_cookies,
    device_id,
    client_version
  })

  const conversations = await client.get_all_conversations({
    max_conversations: config.max_conversations
  })

  log(`Found ${conversations.length} ChatGPT conversations from API`)
  return conversations
}

/**
 * Validate ChatGPT conversation structure
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.session - Raw ChatGPT conversation data
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export const validate_chatgpt_session_structure = ({ session }) => {
  const errors = []

  // Required fields
  if (!session.session_id) {
    errors.push('Missing session_id')
  }

  if (!session.title) {
    errors.push('Missing title')
  }

  if (!session.messages || !Array.isArray(session.messages)) {
    errors.push('Missing or invalid messages array')
  } else if (session.messages.length === 0) {
    errors.push('No messages in conversation')
  }

  if (!session.created_at) {
    errors.push('Missing created_at timestamp')
  }

  // Validate message structure for first few messages
  if (session.messages) {
    for (let i = 0; i < Math.min(session.messages.length, 5); i++) {
      const msg = session.messages[i]
      if (!msg.id) {
        errors.push(`Message ${i} missing id`)
      }
      if (!msg.role) {
        errors.push(`Message ${i} missing role`)
      }
      if (!msg.timestamp) {
        errors.push(`Message ${i} missing timestamp`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Generate deterministic thread ID for ChatGPT conversation
 *
 * @param {Object} params - Parameters object
 * @param {string} params.session_id - ChatGPT session ID
 * @returns {string} Deterministic thread ID
 */
export const generate_chatgpt_thread_id = ({ session_id }) => {
  return uuidv5(`chatgpt:${session_id}`, CHATGPT_NAMESPACE)
}

/**
 * Get inference provider name for ChatGPT sessions
 *
 * @returns {string} ChatGPT inference provider name
 */
export const get_chatgpt_inference_provider = () => {
  return 'chatgpt'
}

/**
 * Extract models from ChatGPT conversation metadata
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.raw_session - Raw ChatGPT conversation data
 * @returns {Array} Array of model identifiers
 */
export const extract_chatgpt_models_from_session = ({ raw_session }) => {
  const models = []

  // Extract from metadata if available
  if (raw_session.metadata?.default_model_slug) {
    models.push(raw_session.metadata.default_model_slug)
  }

  // Could also extract from individual messages if they have model information
  // This would require analyzing message metadata for model switches

  return models
}

/**
 * Get session ID from ChatGPT conversation
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.raw_session - Raw ChatGPT conversation data
 * @returns {string} Session identifier
 */
export const get_chatgpt_session_id = ({ raw_session }) => {
  return raw_session.session_id || raw_session.id
}

/**
 * Generate thread metadata for ChatGPT conversation
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.conversation - ChatGPT conversation object
 * @returns {Object} Thread metadata object
 */
export const generate_chatgpt_thread_metadata = ({ conversation }) => {
  const counts = calculate_session_counts(conversation.messages || [])
  const start_time = conversation.created_at
  const end_time = conversation.updated_at

  // Calculate duration
  let duration_minutes = null
  if (start_time && end_time) {
    const start = new Date(start_time)
    const end = new Date(end_time)
    duration_minutes = (end - start) / 1000 / 60
  }

  // Analyze message types
  const message_types = {}
  const role_counts = {}
  let has_tool_usage = false

  conversation.messages?.forEach((msg) => {
    message_types[msg.type] = (message_types[msg.type] || 0) + 1
    role_counts[msg.role] = (role_counts[msg.role] || 0) + 1

    if (msg.type === 'tool_call' || msg.type === 'tool_result') {
      has_tool_usage = true
    }
  })

  return {
    // Basic thread info
    provider: 'chatgpt',
    session_id: conversation.session_id,
    title: conversation.title,

    // Timing information
    created_at: start_time,
    updated_at: end_time,
    duration_minutes,

    // Content analysis
    message_count: counts.message_count,
    tool_call_count: counts.tool_call_count,
    message_types,
    role_counts,
    has_tool_usage,

    // ChatGPT-specific metadata
    chatgpt_metadata: {
      conversation_id: conversation.session_id,
      gizmo_id: conversation.metadata?.gizmo_id,
      gizmo_type: conversation.metadata?.gizmo_type,
      model_slug: conversation.metadata?.default_model_slug,
      memory_scope: conversation.metadata?.memory_scope,
      is_archived: conversation.metadata?.is_archived,
      is_starred: conversation.metadata?.is_starred,
      conversation_origin: conversation.metadata?.conversation_origin,
      workspace_id: conversation.metadata?.workspace_id
    },

    // Context information
    context: conversation.context
  }
}
