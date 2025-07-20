/**
 * OpenAI Thread Creation
 *
 * Creates Base execution threads from normalized OpenAI conversation data.
 * Handles thread structure, timeline generation, and deterministic UUID creation.
 */

import debug from 'debug'
import { v5 as uuidv5 } from 'uuid'
import { create_thread_from_session } from '#libs-server/integrations/thread/create-from-session.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import { OPENAI_NAMESPACE } from '#libs-server/integrations/openai/openai-config.mjs'

const log = debug('integrations:openai:thread')

/**
 * Create Base threads from OpenAI conversations
 */
export async function create_threads_from_openai_conversations(
  conversations,
  options = {}
) {
  const { user_base_directory = get_user_base_directory(), verbose = false } =
    options

  const results = {
    created: [],
    failed: [],
    skipped: []
  }

  log(`Creating threads for ${conversations.length} OpenAI conversations`)

  for (const conversation of conversations) {
    try {
      const result = await create_thread_from_openai_conversation(
        conversation,
        {
          user_base_directory,
          verbose
        }
      )

      if (result.status === 'skipped') {
        results.skipped.push(result)
        if (verbose) {
          log(`↷ Skipped: ${conversation.title} (${result.reason})`)
        }
      } else {
        results.created.push(result)
        if (verbose) {
          log(`✓ Created: ${conversation.title}`)
        }
      }
    } catch (error) {
      log(
        `✗ Failed to create thread for conversation ${conversation.session_id}: ${error.message}`
      )
      results.failed.push({
        session_id: conversation.session_id,
        title: conversation.title,
        error: error.message
      })
    }
  }

  const total =
    results.created.length + results.failed.length + results.skipped.length
  const success_rate =
    total > 0 ? Math.round((results.created.length / total) * 100) : 0

  log(
    `Thread creation completed: ${results.created.length}/${total} success (${success_rate}%)`
  )

  return results
}

/**
 * Create a single Base thread from OpenAI conversation
 */
export async function create_thread_from_openai_conversation(
  conversation,
  options = {}
) {
  const {
    user_base_directory = get_user_base_directory(),
    force_create = false
  } = options

  // Generate deterministic thread ID
  const thread_id = uuidv5(
    `openai:${conversation.session_id}`,
    OPENAI_NAMESPACE
  )

  log(
    `Creating thread ${thread_id} for OpenAI conversation ${conversation.session_id}`
  )

  // Convert to common session format for thread creation
  const session_data = {
    session_id: conversation.session_id,
    thread_id,
    session_provider: 'openai',
    title: conversation.title,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    messages: conversation.messages,
    metadata: {
      ...conversation.metadata,
      // Add OpenAI-specific metadata
      provider_data: {
        conversation_id: conversation.session_id,
        current_node: conversation.metadata?.current_node,
        gizmo_id: conversation.metadata?.gizmo_id,
        gizmo_type: conversation.metadata?.gizmo_type,
        memory_scope: conversation.metadata?.memory_scope,
        conversation_origin: conversation.metadata?.conversation_origin,
        workspace_id: conversation.metadata?.workspace_id,
        model_slug: conversation.metadata?.default_model_slug
      }
    },
    context: conversation.context || {}
  }

  // Create thread using shared thread creation logic
  return await create_thread_from_session({
    normalized_session: session_data,
    user_base_directory,
    force_create
  })
}

/**
 * Build timeline entries from OpenAI messages
 */
export function build_openai_timeline_entries(messages) {
  const timeline_entries = []

  for (const message of messages) {
    const entry = build_timeline_entry_from_message(message)
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
 * Build timeline entry from individual message
 */
function build_timeline_entry_from_message(message) {
  const base_entry = {
    id: message.id,
    timestamp: message.timestamp,
    type: map_message_type_to_timeline_type(message.type, message.role),
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
 */
function map_message_type_to_timeline_type(message_type, role) {
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
 */
export function generate_openai_thread_metadata(conversation) {
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
