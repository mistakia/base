import debug from 'debug'
import path from 'path'
import os from 'os'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const log = debug('integrations:cursor:read-database')

// Expand tilde in path
const expand_path = (file_path) => {
  if (file_path.startsWith('~/')) {
    return path.join(os.homedir(), file_path.slice(2))
  }
  return file_path
}

/**
 * Find all composer data entries in Cursor database
 */
export const find_cursor_composer_data = async ({ db_path }) => {
  const full_path = expand_path(db_path)
  log(`Opening Cursor database at: ${full_path}`)

  const db = await open({
    filename: full_path,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY
  })

  try {
    const rows = await db.all(`
      SELECT key, length(value) as size 
      FROM cursorDiskKV 
      WHERE key LIKE 'composerData:%' 
        AND value IS NOT NULL 
        AND length(value) > 100
      ORDER BY size DESC
    `)

    log(`Found ${rows.length} composer data entries`)
    return rows
  } finally {
    await db.close()
  }
}

/**
 * Read a single Cursor conversation by composer ID
 */
export const read_cursor_conversation = async (composer_id, options = {}) => {
  const {
    db_path = '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb'
  } = options

  const full_path = expand_path(db_path)
  const key = composer_id.startsWith('composerData:')
    ? composer_id
    : `composerData:${composer_id}`

  log(`Reading conversation ${key} from ${full_path}`)

  const db = await open({
    filename: full_path,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY
  })

  try {
    const row = await db.get(
      'SELECT value FROM cursorDiskKV WHERE key = ?',
      key
    )
    if (!row) {
      log(`Conversation ${key} not found`)
      return null
    }

    const json_str = row.value.toString('utf-8')
    const data = JSON.parse(json_str)

    // Extract conversation data
    const conversation = extract_conversation_data(data, composer_id)
    return conversation
  } catch (error) {
    log(`Error reading conversation ${key}: ${error.message}`)
    throw error
  } finally {
    await db.close()
  }
}

/**
 * Read all Cursor conversations from database
 */
export const read_all_cursor_conversations = async ({
  db_path = '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb',
  filter_conversations = null,
  limit = null
} = {}) => {
  const composer_data_rows = await find_cursor_composer_data({ db_path })

  const conversations = []
  const full_path = expand_path(db_path)

  const db = await open({
    filename: full_path,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY
  })

  try {
    const rows_to_process = limit
      ? composer_data_rows.slice(0, limit)
      : composer_data_rows

    for (const row of rows_to_process) {
      try {
        const data_row = await db.get(
          'SELECT value FROM cursorDiskKV WHERE key = ?',
          row.key
        )
        if (!data_row || !data_row.value) {
          log(`No data found for ${row.key}`)
          continue
        }

        const json_str = data_row.value.toString('utf-8')
        const data = JSON.parse(json_str)

        const conversation = extract_conversation_data(
          data,
          row.key.replace('composerData:', '')
        )

        // Only include conversations with messages
        if (
          conversation &&
          conversation.messages &&
          conversation.messages.length > 0
        ) {
          if (!filter_conversations || filter_conversations(conversation)) {
            conversations.push(conversation)
          }
        }
      } catch (error) {
        log(`Error processing ${row.key}: ${error.message}`)
        // Continue with other conversations
      }
    }

    log(`Successfully read ${conversations.length} conversations`)
    return conversations
  } finally {
    await db.close()
  }
}

/**
 * Extract conversation data from composer data structure
 */
function extract_conversation_data(data, composer_id) {
  const conversation = {
    composer_id,
    created_at: data.createdAt,
    last_updated_at: data.lastUpdatedAt,
    name: data.name,
    model: data.model || 'unknown',
    messages: []
  }

  // Handle different data structures
  if (data.conversation) {
    log(
      `Processing conversation for ${composer_id}, type: ${typeof data.conversation}, isArray: ${Array.isArray(data.conversation)}`
    )

    // Single conversation format - could be array or object with numeric keys
    if (Array.isArray(data.conversation)) {
      log(
        `Processing conversation array with ${data.conversation.length} entries`
      )
      conversation.messages = extract_messages_from_conversation(
        data.conversation
      )
    } else if (typeof data.conversation === 'object') {
      // Object with numeric keys - convert to array
      const conversation_array = Object.keys(data.conversation)
        .filter((key) => !isNaN(key))
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map((key) => data.conversation[key])

      log(
        `Processing conversation object with ${conversation_array.length} entries`
      )
      conversation.messages =
        extract_messages_from_conversation(conversation_array)
    }
    conversation.summary = data.latestConversationSummary
    log(`Extracted ${conversation.messages.length} messages`)
  } else if (data.conversationMap) {
    // Multiple conversations format - take the first or most recent
    const conv_ids = Object.keys(data.conversationMap)
    if (conv_ids.length > 0) {
      // Try to find the most recent conversation
      let latest_conv = null
      let latest_time = 0

      for (const conv_id of conv_ids) {
        const conv = data.conversationMap[conv_id]
        const conv_time = conv.updatedAt || conv.createdAt || 0
        if (conv_time > latest_time) {
          latest_time = conv_time
          latest_conv = conv
        }
      }

      if (latest_conv) {
        conversation.messages = extract_messages_from_conversation(latest_conv)
      }
    }
    conversation.summary = data.latestConversationSummary
  } else if (data.fullConversationHeadersOnly) {
    // Headers only format - limited data
    log(`Conversation ${composer_id} has headers only, skipping`)
    return null
  }

  // Add additional metadata
  conversation.context = data.context
  conversation.capabilities = data.capabilities
  conversation.code_block_data = data.codeBlockData
  conversation.usage_data = data.usageData

  return conversation
}

/**
 * Extract messages from a conversation object
 */
function extract_messages_from_conversation(conv) {
  const messages = []

  log(
    `extract_messages_from_conversation called with type: ${typeof conv}, isArray: ${Array.isArray(conv)}, length: ${conv?.length}`
  )

  // Handle different conversation structures
  if (Array.isArray(conv)) {
    // Direct array of messages/entries
    log(`Processing array of ${conv.length} conversation entries`)
    for (let i = 0; i < Math.min(conv.length, 10); i++) {
      const entry = conv[i]
      log(
        `Entry ${i}: type=${typeof entry}, keys=${entry ? Object.keys(entry).join(',') : 'null'}`
      )

      const extracted = extract_message_data(entry)
      if (extracted) {
        messages.push(extracted)
        log(`Extracted message ${i}: role=${extracted.role}`)
      } else {
        log(`Entry ${i} did not extract to a message`)
      }
    }

    // Process remaining entries without debug logging
    for (let i = 10; i < conv.length; i++) {
      const entry = conv[i]
      const extracted = extract_message_data(entry)
      if (extracted) {
        messages.push(extracted)
      }
    }
  } else if (conv.messages && Array.isArray(conv.messages)) {
    // Direct messages array
    log(`Processing messages array with ${conv.messages.length} entries`)
    for (const msg of conv.messages) {
      const extracted = extract_message_data(msg)
      if (extracted) {
        messages.push(extracted)
      }
    }
  } else if (conv.turns && Array.isArray(conv.turns)) {
    // Turns-based structure
    log(`Processing turns array with ${conv.turns.length} entries`)
    for (const turn of conv.turns) {
      if (turn.messages && Array.isArray(turn.messages)) {
        for (const msg of turn.messages) {
          const extracted = extract_message_data(msg)
          if (extracted) {
            messages.push(extracted)
          }
        }
      }
    }
  } else if (conv.content) {
    // Single content structure
    log('Processing single content structure')
    const extracted = extract_message_data(conv)
    if (extracted) {
      messages.push(extracted)
    }
  } else {
    log(`Unknown conversation structure: ${typeof conv}`)
  }

  log(`Extracted ${messages.length} total messages`)
  return messages
}

/**
 * Extract and normalize message data
 */
function extract_message_data(msg) {
  // Determine role from Cursor-specific fields
  let role = 'unknown'

  if (msg.type === 1) {
    role = 'user' // Type 1 appears to be user messages
  } else if (msg.type === 2) {
    role = 'assistant' // Type 2 appears to be assistant messages
  } else if (msg.isChat !== undefined) {
    role = msg.isChat ? 'assistant' : 'user'
  } else if (msg.isThought) {
    role = 'assistant' // Thoughts are internal to assistant
  } else if (msg.role) {
    role = msg.role
  } else if (msg.author) {
    role = msg.author
  }

  const message = {
    id: msg.bubbleId || msg.id || msg.uuid || generate_message_id(),
    role,
    type: msg.isThought ? 'thought' : 'text',
    timestamp: msg.timestamp || msg.createdAt || msg.created_at
  }

  // Extract content - Cursor uses different field names
  if (typeof msg.content === 'string') {
    message.content = msg.content
  } else if (typeof msg.text === 'string') {
    message.content = msg.text
  } else if (typeof msg.richText === 'string') {
    message.content = msg.richText
  } else if (Array.isArray(msg.content)) {
    // Handle content parts array
    message.content_parts = msg.content.map((part) => {
      if (typeof part === 'string') {
        return { type: 'text', text: part }
      } else if (part.text) {
        return { type: part.type || 'text', text: part.text }
      } else if (part.code) {
        return { type: 'code', code: part.code, language: part.language }
      } else {
        return part
      }
    })

    // Also create a combined text content
    message.content = message.content_parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join('\n')
  } else if (msg.content && typeof msg.content === 'object') {
    if (msg.content.text) {
      message.content = msg.content.text
    } else {
      message.content = JSON.stringify(msg.content)
    }
  }

  // Skip empty messages or internal processing entries
  if (!message.content || message.content.trim() === '') {
    return null
  }

  // Skip thoughts and capability iterations unless they have meaningful content
  if (msg.isThought && message.content.length < 10) {
    return null
  }

  if (msg.isCapabilityIteration) {
    return null // Skip internal capability processing
  }

  // Add Cursor-specific metadata
  if (msg.serverBubbleId) message.server_bubble_id = msg.serverBubbleId
  if (msg.codeBlocks) message.code_blocks = msg.codeBlocks
  if (msg.capabilityType) message.capability_type = msg.capabilityType
  if (msg.timingInfo) message.timing_info = msg.timingInfo

  // Add additional fields if present
  if (msg.model) message.model = msg.model
  if (msg.usage) message.usage = msg.usage
  if (msg.error) message.error = msg.error
  if (msg.finish_reason) message.finish_reason = msg.finish_reason

  return message
}

/**
 * Generate a message ID
 */
function generate_message_id() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get a summary of a conversation
 */
export const get_conversation_summary = (conversation) => {
  const messages = conversation.messages || []
  const message_count = messages.length

  // Calculate duration if we have timestamps
  let start_time = null
  let end_time = null
  let duration_minutes = null

  if (messages.length > 0) {
    const timestamps = messages
      .map((m) => m.timestamp)
      .filter((t) => t)
      .map((t) => new Date(t).getTime())
      .filter((t) => !isNaN(t))

    if (timestamps.length > 0) {
      start_time = new Date(Math.min(...timestamps))
      end_time = new Date(Math.max(...timestamps))
      duration_minutes = (end_time - start_time) / 1000 / 60
    }
  }

  // Check for code blocks
  const has_code_blocks = messages.some(
    (m) =>
      m.content?.includes('```') ||
      m.content_parts?.some((p) => p.type === 'code')
  )

  // Get model used (from last assistant message)
  const model_used =
    messages
      .filter((m) => m.role === 'assistant' && m.model)
      .map((m) => m.model)
      .pop() || 'unknown'

  return {
    composer_id: conversation.composer_id,
    message_count,
    start_time,
    end_time,
    duration_minutes,
    summary:
      conversation.summary || `Conversation with ${message_count} messages`,
    has_code_blocks,
    model_used
  }
}
