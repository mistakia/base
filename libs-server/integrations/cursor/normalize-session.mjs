import debug from 'debug'

import {
  create_tool_call_entry,
  create_tool_result_entry
} from '#libs-server/integrations/shared/tool-extraction-utils.mjs'

const log = debug('integrations:cursor:normalize')

// Track unsupported properties for future implementation
const UNSUPPORTED_TRACKING = {
  conversation_fields: new Set(),
  message_fields: new Set(),
  message_types: new Set(),
  capability_types: new Set(),
  context_fields: new Set()
}

const log_unsupported = (category, value, context = '') => {
  if (!UNSUPPORTED_TRACKING[category].has(value)) {
    UNSUPPORTED_TRACKING[category].add(value)
    log(
      `UNSUPPORTED ${category.toUpperCase()}: ${value} ${context ? `(${context})` : ''}`
    )
  }
}

/**
 * Normalize a single Cursor conversation to common session format
 */
export const normalize_cursor_conversation = (conversation) => {
  log(`Normalizing Cursor conversation ${conversation.composer_id}`)

  // Track unknown conversation fields
  const known_conversation_fields = [
    'composer_id',
    'created_at',
    'last_updated_at',
    'name',
    'model',
    'messages',
    'summary',
    'capabilities',
    'usage_data',
    'context',
    'code_block_data'
  ]
  Object.keys(conversation).forEach((key) => {
    if (!known_conversation_fields.includes(key)) {
      log_unsupported('conversation_fields', key)
    }
  })

  const session = {
    session_id: conversation.composer_id,
    session_provider: 'cursor',
    created_at: conversation.created_at,
    updated_at: conversation.last_updated_at,
    metadata: {
      name: conversation.name,
      model: conversation.model,
      summary: conversation.summary,
      capabilities: conversation.capabilities,
      usage_data: conversation.usage_data,
      context: conversation.context
    },
    messages: []
  }

  // Track capabilities if present
  if (conversation.capabilities && Array.isArray(conversation.capabilities)) {
    conversation.capabilities.forEach((cap) => {
      // Handle capability objects vs strings
      let capType = cap
      if (typeof cap === 'object' && cap !== null) {
        capType = cap.type || cap.name || JSON.stringify(cap)
      }

      if (!['code_interpreter', 'file_search', 'browser'].includes(capType)) {
        log_unsupported('capability_types', capType)
      }
    })
  }

  // Track context fields
  if (conversation.context && typeof conversation.context === 'object') {
    const known_context_fields = ['files', 'folders', 'workspace']
    Object.keys(conversation.context).forEach((key) => {
      if (!known_context_fields.includes(key)) {
        log_unsupported('context_fields', key)
      }
    })
  }

  // Normalize messages and extract tool interactions
  for (const msg of conversation.messages || []) {
    const normalized = normalize_message(msg)
    if (normalized) {
      session.messages.push(normalized)

      // Extract potential tool interactions as separate timeline entries
      const tool_entries = extract_cursor_tool_interactions(msg)
      tool_entries.forEach((tool_entry) => {
        if (tool_entry) {
          session.messages.push(tool_entry)
        }
      })
    }
  }

  // Sort messages by timestamp
  session.messages.sort((a, b) => {
    const timeA = new Date(a.timestamp || 0).getTime()
    const timeB = new Date(b.timestamp || 0).getTime()
    return timeA - timeB
  })

  // Calculate session duration
  if (session.messages.length > 0) {
    const firstMsg = session.messages[0]
    const lastMsg = session.messages[session.messages.length - 1]

    session.metadata.start_time = firstMsg.timestamp
    session.metadata.end_time = lastMsg.timestamp

    if (firstMsg.timestamp && lastMsg.timestamp) {
      const duration =
        new Date(lastMsg.timestamp) - new Date(firstMsg.timestamp)
      session.metadata.duration_ms = duration
      session.metadata.duration_minutes = duration / 1000 / 60
    }
  }

  // Add code block data if present
  if (conversation.code_block_data) {
    session.metadata.code_blocks = normalize_code_blocks(
      conversation.code_block_data
    )
  }

  return session
}

/**
 * Normalize multiple Cursor conversations
 */
export const normalize_cursor_conversations = (conversations) => {
  log(`Normalizing ${conversations.length} Cursor conversations`)

  const sessions = []
  for (const conversation of conversations) {
    try {
      const session = normalize_cursor_conversation(conversation)
      sessions.push(session)
    } catch (error) {
      log(
        `Error normalizing conversation ${conversation.composer_id}: ${error.message}`
      )
    }
  }

  log(`Successfully normalized ${sessions.length} conversations`)
  return sessions
}

/**
 * Extract potential tool interactions from Cursor messages
 * This is a basic implementation since Cursor's tool interaction patterns
 * are not well-defined in the current schema
 */
function extract_cursor_tool_interactions(msg) {
  const tool_entries = []

  try {
    // Pattern 1: Messages with capability_type (potential tool calls)
    if (
      msg.capability_type &&
      ['code_interpreter', 'file_search', 'browser'].includes(
        msg.capability_type
      )
    ) {
      const tool_call_entry = create_tool_call_entry({
        parent_id: msg.id,
        tool_name: msg.capability_type,
        tool_parameters: {
          content: msg.content,
          content_parts: msg.content_parts
        },
        tool_call_id: `${msg.id}-${msg.capability_type}`,
        timestamp: msg.timestamp,
        provider_data: {
          cursor_capability: msg.capability_type,
          is_extracted_tool: true,
          message_type: msg.type,
          timing_info: msg.timing_info
        }
      })

      if (tool_call_entry) {
        tool_entries.push(tool_call_entry)
      }
    }

    // Pattern 2: Tool role messages (potential tool results)
    if (msg.role === 'tool') {
      const tool_result_entry = create_tool_result_entry({
        tool_call_id: msg.server_bubble_id || `${msg.id}-result`,
        result: msg.content,
        error: msg.error,
        timestamp: msg.timestamp,
        provider_data: {
          cursor_tool_response: true,
          is_extracted_tool: true,
          message_type: msg.type,
          timing_info: msg.timing_info,
          finish_reason: msg.finish_reason
        }
      })

      if (tool_result_entry) {
        tool_entries.push(tool_result_entry)
      }
    }

    // Pattern 3: Code execution content parts (potential tool interactions)
    if (msg.content_parts && Array.isArray(msg.content_parts)) {
      msg.content_parts.forEach((part, index) => {
        if (part.type === 'code' && part.language && part.code) {
          const tool_call_entry = create_tool_call_entry({
            parent_id: msg.id,
            tool_name: 'code_execution',
            tool_parameters: {
              language: part.language,
              code: part.code
            },
            tool_call_id: `${msg.id}-code-${index}`,
            timestamp: msg.timestamp,
            provider_data: {
              cursor_code_execution: true,
              is_extracted_tool: true,
              content_part_index: index,
              language: part.language
            }
          })

          if (tool_call_entry) {
            tool_entries.push(tool_call_entry)
          }
        }
      })
    }
  } catch (error) {
    log(
      `Error extracting tool interactions from Cursor message ${msg.id}: ${error.message}`
    )
  }

  return tool_entries
}

/**
 * Normalize a single message
 */
function normalize_message(msg) {
  // Track unknown message fields
  const known_message_fields = [
    'id',
    'role',
    'timestamp',
    'content',
    'content_parts',
    'model',
    'usage',
    'error',
    'type',
    'server_bubble_id',
    'code_blocks',
    'capability_type',
    'timing_info',
    'finish_reason'
  ]
  Object.keys(msg).forEach((key) => {
    if (!known_message_fields.includes(key)) {
      log_unsupported(
        'message_fields',
        key,
        `in ${msg.role || 'unknown'} message`
      )
    }
  })

  const normalized = {
    id: msg.id,
    role: normalize_role(msg.role),
    timestamp: msg.timestamp,
    content: msg.content || ''
  }

  // Handle content parts
  if (msg.content_parts && Array.isArray(msg.content_parts)) {
    normalized.content_parts = msg.content_parts.map((part) => {
      // Track unknown content part types
      if (part.type && !['code', 'text', 'image', 'file'].includes(part.type)) {
        log_unsupported('message_types', `content_part.${part.type}`)
      }

      if (part.type === 'code') {
        return {
          type: 'code',
          language: part.language || 'plaintext',
          code: part.code || part.text || ''
        }
      } else {
        return {
          type: 'text',
          text: part.text || ''
        }
      }
    })
  }

  // Add model information for assistant messages
  if (normalized.role === 'assistant' && msg.model) {
    normalized.model = msg.model
  }

  // Add usage data if present
  if (msg.usage) {
    normalized.usage = {
      input_tokens: msg.usage.prompt_tokens || msg.usage.input_tokens,
      output_tokens: msg.usage.completion_tokens || msg.usage.output_tokens,
      total_tokens: msg.usage.total_tokens
    }
  }

  // Add error information if present
  if (msg.error) {
    normalized.error = msg.error
  }

  return normalized
}

/**
 * Normalize role to standard format
 */
function normalize_role(role) {
  const roleMap = {
    human: 'user',
    user: 'user',
    assistant: 'assistant',
    ai: 'assistant',
    system: 'system',
    tool: 'tool'
  }

  const normalized = roleMap[role?.toLowerCase()] || role || 'unknown'
  return normalized
}

/**
 * Normalize code block data
 */
function normalize_code_blocks(codeBlockData) {
  if (!codeBlockData) return []

  const blocks = []

  // Handle different code block data structures
  if (Array.isArray(codeBlockData)) {
    for (const block of codeBlockData) {
      blocks.push({
        id: block.id || `block_${blocks.length}`,
        language: block.language || 'plaintext',
        code: block.code || block.content || '',
        file_path: block.filePath || block.file_path,
        line_start: block.lineStart || block.line_start,
        line_end: block.lineEnd || block.line_end
      })
    }
  } else if (typeof codeBlockData === 'object') {
    // Object format with keys as IDs
    for (const [id, block] of Object.entries(codeBlockData)) {
      blocks.push({
        id,
        language: block.language || 'plaintext',
        code: block.code || block.content || '',
        file_path: block.filePath || block.file_path,
        line_start: block.lineStart || block.line_start,
        line_end: block.lineEnd || block.line_end
      })
    }
  }

  return blocks
}

// Export the unsupported tracking for reporting
export const get_unsupported_summary = () => {
  return {
    conversation_fields: Array.from(UNSUPPORTED_TRACKING.conversation_fields),
    message_fields: Array.from(UNSUPPORTED_TRACKING.message_fields),
    message_types: Array.from(UNSUPPORTED_TRACKING.message_types),
    capability_types: Array.from(UNSUPPORTED_TRACKING.capability_types),
    context_fields: Array.from(UNSUPPORTED_TRACKING.context_fields)
  }
}

// Clear tracking for fresh analysis
export const clear_unsupported_tracking = () => {
  UNSUPPORTED_TRACKING.conversation_fields.clear()
  UNSUPPORTED_TRACKING.message_fields.clear()
  UNSUPPORTED_TRACKING.message_types.clear()
  UNSUPPORTED_TRACKING.capability_types.clear()
  UNSUPPORTED_TRACKING.context_fields.clear()
}
