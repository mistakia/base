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
import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'

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
 * Build timeline entries from ChatGPT messages
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.messages - Array of ChatGPT messages
 * @returns {Array} Array of timeline entries
 */
export const build_chatgpt_timeline_entries = ({ messages }) => {
  const timeline_entries = []

  for (const message of messages) {
    const entry = build_timeline_entry_from_message({ message })
    if (entry) {
      timeline_entries.push(entry)
    }
  }

  log(
    `Built ${timeline_entries.length} timeline entries from ${messages.length} messages`
  )
  return timeline_entries
}

/**
 * Build timeline entry from individual ChatGPT message
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.message - ChatGPT message object
 * @returns {Object|null} Timeline entry or null if invalid
 */
export const build_timeline_entry_from_message = ({ message }) => {
  const base_entry = {
    id: message.id,
    timestamp: message.timestamp,
    type: map_message_type_to_timeline_type({
      message_type: message.type,
      role: message.role
    }),
    provider: 'chatgpt',
    schema_version: TIMELINE_SCHEMA_VERSION
  }

  switch (message.type) {
    case 'text':
      return {
        ...base_entry,
        type: 'message',
        data: {
          role: message.role,
          content: message.content,
          content_parts: message.content_parts
        }
      }

    case 'code':
      return {
        ...base_entry,
        type: 'message',
        data: {
          role: message.role,
          content: message.content,
          code: message.code,
          language: message.language
        }
      }

    case 'tool_call':
      return {
        ...base_entry,
        type: 'tool_call',
        data: {
          tool_name: message.tool_call.name,
          parameters: message.tool_call.parameters,
          invocation_id: message.tool_call.invocation_id
        }
      }

    case 'tool_result':
      return {
        ...base_entry,
        type: 'tool_result',
        data: {
          output: message.execution_data?.output || message.content,
          error: message.execution_data?.error,
          exit_code: message.execution_data?.exit_code
        }
      }

    case 'context':
      return {
        ...base_entry,
        type: 'system',
        system_type: 'configuration',
        content: 'Model context updated',
        metadata: {
          change_type: 'context_update',
          context_data: message.context_data
        }
      }

    case 'multimodal':
      return {
        ...base_entry,
        type: 'message',
        data: {
          role: message.role,
          content: message.content,
          content_parts: message.content_parts,
          multimodal: true
        }
      }

    default:
      // Default to message type
      log(
        `Unexpected normalized message type '${message.type}' in timeline conversion - this may indicate a coding gap`
      )
      return {
        ...base_entry,
        type: 'message',
        data: {
          role: message.role,
          content: message.content || '',
          message_type: message.type
        }
      }
  }
}

/**
 * Map ChatGPT message types to Base timeline entry types
 *
 * @param {Object} params - Parameters object
 * @param {string} params.message_type - Message type from ChatGPT
 * @param {string} params.role - Message role
 * @returns {string} Timeline entry type
 */
export const map_message_type_to_timeline_type = ({ message_type, role }) => {
  switch (message_type) {
    case 'tool_call':
      return 'tool_call'
    case 'tool_result':
      return 'tool_result'
    case 'context':
      return 'system'
    case 'text':
    case 'code':
    case 'multimodal':
    default:
      if (
        message_type &&
        !['text', 'code', 'multimodal'].includes(message_type)
      ) {
        log(
          `Unexpected message type '${message_type}' in timeline type mapping - defaulting to 'message'`
        )
      }
      return 'message'
  }
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
