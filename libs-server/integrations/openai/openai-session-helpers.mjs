/**
 * OpenAI Session Helper Functions
 *
 * Focused helper functions for OpenAI session processing.
 * Keeps provider class small while handling specific operations.
 */

import debug from 'debug'
import { v5 as uuidv5 } from 'uuid'
import { OPENAI_NAMESPACE } from './openai-config.mjs'

const log = debug('integrations:openai:session-helpers')

/**
 * Find OpenAI conversations from provided data
 * Note: OpenAI conversations come from API and must be provided directly
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.conversations - Array of OpenAI conversations
 * @returns {Promise<Array>} Array of raw OpenAI conversation objects
 */
export const find_openai_sessions_from_data = async ({
  conversations = []
}) => {
  log(`Processing ${conversations.length} provided OpenAI conversations`)
  return conversations
}

/**
 * Find OpenAI conversations from API
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.auth_options - Authentication options for OpenAI API
 * @param {number} params.max_conversations - Maximum conversations to fetch
 * @returns {Promise<Array>} Array of raw OpenAI conversation objects
 */
export const find_openai_sessions_from_api = async ({
  auth_options = {},
  max_conversations
}) => {
  const { create_openai_client } = await import('./api/index.mjs')
  const { get_openai_config, validate_openai_auth } = await import(
    './openai-config.mjs'
  )

  const config = get_openai_config({ max_conversations, ...auth_options })
  const { bearer_token, session_cookies, device_id, client_version } = config

  log('Finding OpenAI conversations from API')

  // Validate authentication
  validate_openai_auth({ bearer_token, session_cookies, device_id })

  const client = create_openai_client({
    bearer_token,
    session_cookies,
    device_id,
    client_version
  })

  const conversations = await client.get_all_conversations({
    max_conversations: config.max_conversations
  })

  log(`Found ${conversations.length} OpenAI conversations from API`)
  return conversations
}

/**
 * Validate OpenAI conversation structure
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.session - Raw OpenAI conversation data
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export const validate_openai_session_structure = ({ session }) => {
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
 * Generate deterministic thread ID for OpenAI conversation
 *
 * @param {Object} params - Parameters object
 * @param {string} params.session_id - OpenAI session ID
 * @returns {string} Deterministic thread ID
 */
export const generate_openai_thread_id = ({ session_id }) => {
  return uuidv5(`openai:${session_id}`, OPENAI_NAMESPACE)
}

/**
 * Get inference provider name for OpenAI sessions
 *
 * @returns {string} OpenAI inference provider name
 */
export const get_openai_inference_provider = () => {
  return 'openai'
}

/**
 * Extract models from OpenAI conversation metadata
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.raw_session - Raw OpenAI conversation data
 * @returns {Array} Array of model identifiers
 */
export const extract_openai_models_from_session = ({ raw_session }) => {
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
 * Get session ID from OpenAI conversation
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.raw_session - Raw OpenAI conversation data
 * @returns {string} Session identifier
 */
export const get_openai_session_id = ({ raw_session }) => {
  return raw_session.session_id || raw_session.id
}

/**
 * Build timeline entries from OpenAI messages
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.messages - Array of OpenAI messages
 * @returns {Array} Array of timeline entries
 */
export const build_openai_timeline_entries = ({ messages }) => {
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
 * Build timeline entry from individual OpenAI message
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.message - OpenAI message object
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
    provider: 'openai'
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
        type: 'state_change',
        data: {
          change_type: 'context_update',
          context_data: message.context_data,
          description: 'Model context updated'
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
 * Map OpenAI message types to Base timeline entry types
 *
 * @param {Object} params - Parameters object
 * @param {string} params.message_type - Message type from OpenAI
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
      return 'state_change'
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
 * Generate thread metadata for OpenAI conversation
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.conversation - OpenAI conversation object
 * @returns {Object} Thread metadata object
 */
export const generate_openai_thread_metadata = ({ conversation }) => {
  const message_count = conversation.messages?.length || 0
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
    provider: 'openai',
    session_id: conversation.session_id,
    title: conversation.title,

    // Timing information
    created_at: start_time,
    updated_at: end_time,
    duration_minutes,

    // Content analysis
    message_count,
    message_types,
    role_counts,
    has_tool_usage,

    // OpenAI-specific metadata
    openai_metadata: {
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
