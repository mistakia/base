// import { v4 as uuidv4 } from 'uuid'
import debug from 'debug'

const log = debug('integrations:claude:normalize-session')

// Track unsupported properties for future implementation
const UNSUPPORTED_TRACKING = {
  entry_types: new Set(),
  message_fields: new Set(),
  content_types: new Set(),
  tool_result_formats: new Set(),
  metadata_fields: new Set()
}

const log_unsupported = (category, value, context = '') => {
  if (!UNSUPPORTED_TRACKING[category].has(value)) {
    UNSUPPORTED_TRACKING[category].add(value)
    log(`🔶 UNSUPPORTED ${category.toUpperCase()}: ${value} ${context ? `(${context})` : ''}`)
  }
}

export const normalize_claude_session = (claude_session) => {
  try {
    log(`Normalizing Claude session: ${claude_session.session_id}`)

    const { session_id, entries, metadata } = claude_session

    // Build parent-child relationships from parentUuid
    const entry_map = new Map()
    const normalized_messages = []

    // First pass: create entry map
    entries.forEach(entry => {
      entry_map.set(entry.uuid, entry)
    })

    // Second pass: convert entries to normalized format
    entries.forEach((entry, index) => {
      const normalized_entry = normalize_claude_entry(entry, entry_map, index)
      if (normalized_entry) {
        normalized_messages.push(normalized_entry)
      }
    })

    // Sort by timestamp to ensure chronological order
    normalized_messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    // Extract session metadata
    const session_metadata = extract_session_metadata(entries, metadata)

    return {
      session_id,
      provider: 'claude',
      messages: normalized_messages,
      metadata: session_metadata
    }
  } catch (error) {
    log(`Error normalizing Claude session ${claude_session.session_id}: ${error.message}`)
    throw error
  }
}

const normalize_claude_entry = (entry, entry_map, index) => {
  // Track all properties found in the entry for completeness analysis
  const all_entry_keys = Object.keys(entry)
  const known_keys = ['uuid', 'parentUuid', 'timestamp', 'type', 'message', 'cwd', 'userType', 'requestId', 'isSidechain', 'line_number', 'summary', 'leafUuid', 'toolUseResult', 'version', 'sessionId']

  all_entry_keys.forEach(key => {
    if (!known_keys.includes(key)) {
      log_unsupported('metadata_fields', key, `in ${entry.type} entry`)
    }
  })

  const base_normalized = {
    id: entry.uuid,
    parent_id: entry.parentUuid || null,
    timestamp: new Date(entry.timestamp),
    provider_data: {
      line_number: entry.line_number,
      session_index: index,
      is_sidechain: entry.isSidechain || false
    }
  }

  switch (entry.type) {
    case 'user':
      return normalize_user_entry(entry, base_normalized)

    case 'assistant':
      return normalize_assistant_entry(entry, base_normalized)

    case 'summary':
      return {
        ...base_normalized,
        type: 'state_change',
        role: 'system',
        content: entry.summary,
        metadata: {
          summary_type: 'session_summary',
          leaf_uuid: entry.leafUuid
        }
      }

    default:
      log_unsupported('entry_types', entry.type)
      return {
        ...base_normalized,
        type: 'unknown',
        role: 'system',
        content: JSON.stringify(entry),
        metadata: {
          original_type: entry.type,
          unsupported_entry: true
        }
      }
  }
}

const normalize_user_entry = (entry, base_normalized) => {
  // Check for tool use results in user entries
  if (entry.toolUseResult) {
    log_unsupported('message_fields', 'toolUseResult', 'user entry with tool result data')
  }

  // Analyze user message structure
  if (entry.message?.content && Array.isArray(entry.message.content)) {
    entry.message.content.forEach(content_item => {
      if (content_item.type && !['text', 'tool_result'].includes(content_item.type)) {
        log_unsupported('content_types', content_item.type, 'user message content')
      }
    })
  }

  return {
    ...base_normalized,
    type: 'message',
    role: 'user',
    content: extract_user_content(entry.message),
    metadata: {
      cwd: entry.cwd,
      user_type: entry.userType,
      tool_use_result: entry.toolUseResult || null
    }
  }
}

const normalize_assistant_entry = (entry, base_normalized) => {
  // Track assistant message fields
  const message = entry.message || {}
  const known_message_keys = ['role', 'content', 'model', 'usage', 'stop_reason', 'stop_sequence', 'id', 'type']

  Object.keys(message).forEach(key => {
    if (!known_message_keys.includes(key)) {
      log_unsupported('message_fields', key, 'assistant message')
    }
  })

  // Track usage fields
  if (message.usage) {
    const known_usage_keys = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'service_tier']
    Object.keys(message.usage).forEach(key => {
      if (!known_usage_keys.includes(key)) {
        log_unsupported('message_fields', `usage.${key}`, 'assistant usage data')
      }
    })
  }

  return {
    ...base_normalized,
    type: 'message',
    role: 'assistant',
    content: extract_assistant_content(entry.message),
    metadata: {
      model: entry.message?.model,
      request_id: entry.requestId,
      usage: entry.message?.usage,
      stop_reason: entry.message?.stop_reason,
      stop_sequence: entry.message?.stop_sequence
    }
  }
}

const extract_user_content = (message) => {
  if (!message || !message.content) {
    return ''
  }

  if (typeof message.content === 'string') {
    return message.content
  }

  if (Array.isArray(message.content)) {
    return message.content.map(item => {
      if (typeof item === 'string') {
        return item
      }

      switch (item.type) {
        case 'text':
          return item.text || item.content
        case 'tool_result':
          return {
            type: 'tool_result',
            tool_use_id: item.tool_use_id,
            content: item.content
          }
        default:
          log_unsupported('content_types', item.type, 'user message content item')
          return JSON.stringify(item)
      }
    })
  }

  return JSON.stringify(message.content)
}

const extract_assistant_content = (message) => {
  if (!message || !message.content) {
    return ''
  }

  // Handle different content formats
  if (typeof message.content === 'string') {
    return message.content
  }

  if (Array.isArray(message.content)) {
    return message.content.map(item => {
      // Track all properties in content items
      if (typeof item === 'object' && item.type) {
        const known_content_keys = ['type', 'text', 'name', 'id', 'input']
        Object.keys(item).forEach(key => {
          if (!known_content_keys.includes(key)) {
            log_unsupported('content_types', `${item.type}.${key}`, 'assistant content property')
          }
        })
      }

      switch (item.type) {
        case 'text':
          return item.text
        case 'tool_use':
          return {
            type: 'tool_call',
            tool_name: item.name,
            tool_id: item.id,
            parameters: item.input
          }
        default:
          if (item.type) {
            log_unsupported('content_types', item.type, 'assistant message content')
          }
          return JSON.stringify(item)
      }
    })
  }

  return JSON.stringify(message.content)
}

const extract_session_metadata = (entries, file_metadata) => {
  const timestamps = entries.map(e => new Date(e.timestamp)).filter(d => !isNaN(d))
  const start_time = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null
  const end_time = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null

  // Extract model information from assistant messages
  const models = new Set()
  const total_tokens = entries.reduce((total, entry) => {
    if (entry.type === 'assistant' && entry.message?.usage?.input_tokens) {
      const usage = entry.message.usage
      if (entry.message.model) {
        models.add(entry.message.model)
      }
      return total + (usage.input_tokens || 0) + (usage.output_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
    }
    return total
  }, 0)

  // Find summaries for session description
  const summaries = entries
    .filter(e => e.type === 'summary')
    .map(e => e.summary)

  return {
    provider: 'claude',
    model: models.size === 1 ? Array.from(models)[0] : Array.from(models),
    working_directory: file_metadata.cwd,
    claude_version: file_metadata.version,
    user_type: file_metadata.user_type,
    start_time,
    end_time,
    duration_minutes: start_time && end_time ? (end_time - start_time) / (1000 * 60) : null,
    total_tokens,
    entry_count: entries.length,
    summaries,
    file_source: file_metadata.file_path
  }
}

export const normalize_claude_sessions = (claude_sessions) => {
  log(`Normalizing ${claude_sessions.length} Claude sessions`)

  const normalized_sessions = claude_sessions.map(session => {
    try {
      return normalize_claude_session(session)
    } catch (error) {
      log(`Failed to normalize session ${session.session_id}: ${error.message}`)
      return null
    }
  }).filter(Boolean)

  log(`Successfully normalized ${normalized_sessions.length} sessions`)

  // Log summary of unsupported items found
  if (UNSUPPORTED_TRACKING.entry_types.size > 0) {
    log(`🔶 Summary: Found ${UNSUPPORTED_TRACKING.entry_types.size} unsupported entry types: ${Array.from(UNSUPPORTED_TRACKING.entry_types).join(', ')}`)
  }
  if (UNSUPPORTED_TRACKING.content_types.size > 0) {
    log(`🔶 Summary: Found ${UNSUPPORTED_TRACKING.content_types.size} unsupported content types: ${Array.from(UNSUPPORTED_TRACKING.content_types).join(', ')}`)
  }
  if (UNSUPPORTED_TRACKING.message_fields.size > 0) {
    log(`🔶 Summary: Found ${UNSUPPORTED_TRACKING.message_fields.size} unsupported message fields: ${Array.from(UNSUPPORTED_TRACKING.message_fields).join(', ')}`)
  }

  return normalized_sessions
}

export const extract_tool_calls_and_results = (normalized_messages) => {
  const tool_interactions = []

  for (let i = 0; i < normalized_messages.length; i++) {
    const message = normalized_messages[i]

    if (message.role === 'assistant' && Array.isArray(message.content)) {
      const tool_calls = message.content.filter(item => item.type === 'tool_call')

      tool_calls.forEach(tool_call => {
        // Look for corresponding tool result in subsequent user messages
        const tool_result = find_tool_result(normalized_messages, i + 1, tool_call.tool_id)

        tool_interactions.push({
          call_message_id: message.id,
          result_message_id: tool_result?.message_id || null,
          tool_name: tool_call.tool_name,
          tool_id: tool_call.tool_id,
          parameters: tool_call.parameters,
          result: tool_result?.result || null,
          timestamp: message.timestamp
        })
      })
    }
  }

  return tool_interactions
}

const find_tool_result = (messages, start_index, tool_id) => {
  for (let i = start_index; i < Math.min(start_index + 5, messages.length); i++) {
    const message = messages[i]

    // Check for tool results in different formats
    if (message.role === 'user') {
      // Check provider_data first
      if (message.provider_data?.tool_result) {
        const tool_result = message.provider_data.tool_result
        if (tool_result.tool_use_id === tool_id) {
          return {
            message_id: message.id,
            result: tool_result.content
          }
        }
      }

      // Check content array for tool_result items
      if (Array.isArray(message.content)) {
        for (const content_item of message.content) {
          if (content_item.type === 'tool_result' && content_item.tool_use_id === tool_id) {
            return {
              message_id: message.id,
              result: content_item.content
            }
          }
        }
      }

      // Check metadata for tool_use_result (alternative location)
      if (message.metadata?.tool_use_result?.tool_use_id === tool_id) {
        return {
          message_id: message.id,
          result: message.metadata.tool_use_result.content
        }
      }
    }
  }
  return null
}

// Export the unsupported tracking for reporting
export const get_unsupported_summary = () => {
  return {
    entry_types: Array.from(UNSUPPORTED_TRACKING.entry_types),
    message_fields: Array.from(UNSUPPORTED_TRACKING.message_fields),
    content_types: Array.from(UNSUPPORTED_TRACKING.content_types),
    tool_result_formats: Array.from(UNSUPPORTED_TRACKING.tool_result_formats),
    metadata_fields: Array.from(UNSUPPORTED_TRACKING.metadata_fields)
  }
}

// Clear tracking for fresh analysis
export const clear_unsupported_tracking = () => {
  UNSUPPORTED_TRACKING.entry_types.clear()
  UNSUPPORTED_TRACKING.message_fields.clear()
  UNSUPPORTED_TRACKING.content_types.clear()
  UNSUPPORTED_TRACKING.tool_result_formats.clear()
  UNSUPPORTED_TRACKING.metadata_fields.clear()
}
