import { v4 as uuidv4 } from 'uuid'
import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'

const log = debug('integrations:thread:build-timeline-entries')

// Track unsupported message types and content formats for timeline conversion
const TIMELINE_UNSUPPORTED = {
  message_types: new Set(),
  content_formats: new Set(),
  metadata_fields: new Set()
}

const log_timeline_unsupported = (category, value, context = '') => {
  if (!TIMELINE_UNSUPPORTED[category].has(value)) {
    TIMELINE_UNSUPPORTED[category].add(value)
    log(`🔶 TIMELINE UNSUPPORTED ${category.toUpperCase()}: ${value} ${context ? `(${context})` : ''}`)
  }
}

export const build_timeline_from_session = async (normalized_session, thread_info) => {
  try {
    log(`Building timeline for thread ${thread_info.thread_id} from ${normalized_session.provider} session`)

    const timeline_entries = []

    // Add initial state change entry for session import
    timeline_entries.push({
      id: uuidv4(),
      timestamp: new Date(normalized_session.metadata.start_time || Date.now()).toISOString(),
      type: 'state_change',
      content: {
        state: 'session_import_started',
        message: `Importing ${normalized_session.provider} session ${normalized_session.session_id}`,
        metadata: {
          provider: normalized_session.provider,
          session_id: normalized_session.session_id,
          message_count: normalized_session.messages.length,
          source_file: normalized_session.metadata.file_source
        }
      }
    })

    // Convert session messages to timeline entries
    for (const message of normalized_session.messages) {
      const entry = convert_message_to_timeline_entry(message, normalized_session.provider)
      if (entry) {
        timeline_entries.push(entry)
      }
    }

    // Add final state change entry for session completion
    timeline_entries.push({
      id: uuidv4(),
      timestamp: new Date(normalized_session.metadata.end_time || Date.now()).toISOString(),
      type: 'state_change',
      content: {
        state: 'session_import_completed',
        message: `${normalized_session.provider} session import completed`,
        metadata: {
          duration_minutes: normalized_session.metadata.duration_minutes,
          total_entries: timeline_entries.length - 2, // Exclude the two state change entries
          total_tokens: normalized_session.metadata.total_tokens
        }
      }
    })

    // Sort timeline entries by timestamp
    timeline_entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    // Write timeline to file
    const timeline_path = path.join(thread_info.thread_dir, 'timeline.json')
    await fs.writeFile(timeline_path, JSON.stringify(timeline_entries, null, 2))

    log(`Created timeline with ${timeline_entries.length} entries at ${timeline_path}`)

    // Log summary of unsupported items found during timeline conversion
    if (TIMELINE_UNSUPPORTED.message_types.size > 0) {
      log(`🔶 Timeline conversion found ${TIMELINE_UNSUPPORTED.message_types.size} unsupported message types: ${Array.from(TIMELINE_UNSUPPORTED.message_types).join(', ')}`)
    }
    if (TIMELINE_UNSUPPORTED.content_formats.size > 0) {
      log(`🔶 Timeline conversion found ${TIMELINE_UNSUPPORTED.content_formats.size} unsupported content formats: ${Array.from(TIMELINE_UNSUPPORTED.content_formats).join(', ')}`)
    }
    if (TIMELINE_UNSUPPORTED.metadata_fields.size > 0) {
      log(`🔶 Timeline conversion found ${TIMELINE_UNSUPPORTED.metadata_fields.size} unsupported metadata fields: ${Array.from(TIMELINE_UNSUPPORTED.metadata_fields).join(', ')}`)
    }

    return {
      timeline_path,
      entry_count: timeline_entries.length,
      timeline_entries,
      unsupported_items: {
        message_types: Array.from(TIMELINE_UNSUPPORTED.message_types),
        content_formats: Array.from(TIMELINE_UNSUPPORTED.content_formats),
        metadata_fields: Array.from(TIMELINE_UNSUPPORTED.metadata_fields)
      }
    }
  } catch (error) {
    log(`Error building timeline: ${error.message}`)
    throw error
  }
}

const convert_message_to_timeline_entry = (message, provider) => {
  // Track any unexpected message properties
  const known_message_keys = ['id', 'type', 'role', 'content', 'metadata', 'provider_data', 'timestamp', 'parent_id', 'tool_name', 'parameters', 'result', 'tool_id']
  Object.keys(message).forEach(key => {
    if (!known_message_keys.includes(key)) {
      log_timeline_unsupported('metadata_fields', key, `in ${message.type} message`)
    }
  })

  const base_entry = {
    id: message.id,
    timestamp: message.timestamp.toISOString()
  }

  switch (message.type) {
    case 'message':
      return {
        ...base_entry,
        type: 'message',
        content: {
          role: message.role,
          content: format_message_content(message.content),
          metadata: {
            provider,
            ...message.metadata,
            provider_data: message.provider_data
          }
        }
      }

    case 'tool_call':
      return {
        ...base_entry,
        type: 'tool_call',
        content: {
          tool_name: message.tool_name,
          parameters: message.parameters,
          metadata: {
            provider,
            tool_id: message.tool_id,
            ...message.metadata
          }
        }
      }

    case 'tool_result':
      return {
        ...base_entry,
        type: 'tool_result',
        content: {
          tool_name: message.tool_name,
          result: message.result,
          metadata: {
            provider,
            tool_id: message.tool_id,
            ...message.metadata
          }
        }
      }

    case 'state_change':
      return {
        ...base_entry,
        type: 'state_change',
        content: {
          state: message.metadata?.summary_type || 'session_summary',
          message: message.content,
          metadata: {
            provider,
            ...message.metadata
          }
        }
      }

    case 'error':
      return {
        ...base_entry,
        type: 'error',
        content: {
          error: message.content,
          metadata: {
            provider,
            ...message.metadata
          }
        }
      }

    case 'unknown':
      return {
        ...base_entry,
        type: 'message',
        content: {
          role: 'system',
          content: `Unsupported message type: ${message.metadata?.original_type || 'unknown'}\n${message.content}`,
          metadata: {
            provider,
            unsupported_message_type: message.metadata?.original_type,
            ...message.metadata
          }
        }
      }

    default:
      log_timeline_unsupported('message_types', message.type)
      return {
        ...base_entry,
        type: 'message',
        content: {
          role: 'system',
          content: `Unknown message type: ${message.type}\n${JSON.stringify(message, null, 2)}`,
          metadata: {
            provider,
            original_type: message.type,
            unsupported_conversion: true,
            ...message.metadata
          }
        }
      }
  }
}

const format_message_content = (content) => {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content.map(item => {
      if (typeof item === 'string') {
        return item
      }

      if (typeof item === 'object' && item.type) {
        switch (item.type) {
          case 'tool_call':
            return `[Tool Call: ${item.tool_name}]\nParameters: ${JSON.stringify(item.parameters, null, 2)}`
          case 'tool_result':
            return `[Tool Result: ${item.tool_use_id}]\nResult: ${typeof item.content === 'string' ? item.content : JSON.stringify(item.content, null, 2)}`
          default:
            log_timeline_unsupported('content_formats', item.type, 'in message content array')
            return JSON.stringify(item, null, 2)
        }
      }

      return JSON.stringify(item, null, 2)
    }).join('\n\n')
  }

  // Handle object content (non-array)
  if (typeof content === 'object' && content !== null) {
    if (content.type) {
      log_timeline_unsupported('content_formats', content.type, 'in message content object')
    }
    return JSON.stringify(content, null, 2)
  }

  return JSON.stringify(content, null, 2)
}

export const create_timeline_summary = (timeline_entries) => {
  const entry_types = timeline_entries.reduce((counts, entry) => {
    counts[entry.type] = (counts[entry.type] || 0) + 1
    return counts
  }, {})

  const timestamps = timeline_entries.map(entry => new Date(entry.timestamp))
  const start_time = new Date(Math.min(...timestamps))
  const end_time = new Date(Math.max(...timestamps))

  return {
    total_entries: timeline_entries.length,
    entry_types,
    start_time,
    end_time,
    duration_minutes: (end_time - start_time) / (1000 * 60),
    message_count: entry_types.message || 0,
    tool_call_count: entry_types.tool_call || 0,
    tool_result_count: entry_types.tool_result || 0,
    state_change_count: entry_types.state_change || 0,
    error_count: entry_types.error || 0
  }
}
