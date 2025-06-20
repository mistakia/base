import debug from 'debug'

const log = debug('integrations:cursor:normalize')

/**
 * Normalize a single Cursor conversation to common session format
 */
export const normalize_cursor_conversation = (conversation) => {
  log(`Normalizing Cursor conversation ${conversation.composer_id}`)

  const session = {
    session_id: conversation.composer_id,
    provider: 'cursor',
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

  // Normalize messages
  for (const msg of conversation.messages || []) {
    const normalized = normalize_message(msg)
    if (normalized) {
      session.messages.push(normalized)
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
      const duration = new Date(lastMsg.timestamp) - new Date(firstMsg.timestamp)
      session.metadata.duration_ms = duration
      session.metadata.duration_minutes = duration / 1000 / 60
    }
  }

  // Add code block data if present
  if (conversation.code_block_data) {
    session.metadata.code_blocks = normalize_code_blocks(conversation.code_block_data)
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
      log(`Error normalizing conversation ${conversation.composer_id}: ${error.message}`)
    }
  }

  log(`Successfully normalized ${sessions.length} conversations`)
  return sessions
}

/**
 * Normalize a single message
 */
function normalize_message(msg) {
  const normalized = {
    id: msg.id,
    role: normalize_role(msg.role),
    timestamp: msg.timestamp,
    content: msg.content || ''
  }

  // Handle content parts
  if (msg.content_parts && Array.isArray(msg.content_parts)) {
    normalized.content_parts = msg.content_parts.map(part => {
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

// Track unsupported features for reporting
const unsupported_features = new Set()

export const track_unsupported_feature = (feature) => {
  unsupported_features.add(feature)
}

export const get_unsupported_features = () => {
  return Array.from(unsupported_features)
}

export const clear_unsupported_tracking = () => {
  unsupported_features.clear()
}
