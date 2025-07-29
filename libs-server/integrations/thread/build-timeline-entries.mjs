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
    log(
      `TIMELINE UNSUPPORTED ${category.toUpperCase()}: ${value} ${context ? `(${context})` : ''}`
    )
  }
}

export const build_timeline_from_session = async (
  normalized_session,
  thread_info,
  options = {}
) => {
  try {
    log(
      `Building timeline for thread ${thread_info.thread_id} from ${normalized_session.session_provider} session`
    )

    const { update_existing = false } = options
    const timeline_entries = []

    // Convert session messages to timeline entries - these represent the actual session content
    for (const message of normalized_session.messages) {
      const entry = convert_message_to_timeline_entry(
        message,
        normalized_session.session_provider
      )
      if (entry) {
        timeline_entries.push(entry)
      }
    }

    // Sort timeline entries by timestamp to maintain chronological order
    timeline_entries.sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    )

    // Handle existing timeline updates for re-imports
    const timeline_path = path.join(thread_info.thread_dir, 'timeline.json')
    let final_timeline = timeline_entries

    if (update_existing) {
      final_timeline = await merge_with_existing_timeline(
        timeline_path,
        timeline_entries,
        normalized_session
      )
    }

    // Write timeline to file
    await fs.writeFile(timeline_path, JSON.stringify(final_timeline, null, 2))

    log(
      `Created timeline with ${final_timeline.length} entries at ${timeline_path}`
    )

    // Log summary of unsupported items found during timeline conversion
    if (TIMELINE_UNSUPPORTED.message_types.size > 0) {
      log(
        `Timeline conversion found ${TIMELINE_UNSUPPORTED.message_types.size} unsupported message types: ${Array.from(TIMELINE_UNSUPPORTED.message_types).join(', ')}`
      )
    }
    if (TIMELINE_UNSUPPORTED.content_formats.size > 0) {
      log(
        `Timeline conversion found ${TIMELINE_UNSUPPORTED.content_formats.size} unsupported content formats: ${Array.from(TIMELINE_UNSUPPORTED.content_formats).join(', ')}`
      )
    }
    if (TIMELINE_UNSUPPORTED.metadata_fields.size > 0) {
      log(
        `Timeline conversion found ${TIMELINE_UNSUPPORTED.metadata_fields.size} unsupported metadata fields: ${Array.from(TIMELINE_UNSUPPORTED.metadata_fields).join(', ')}`
      )
    }

    return {
      timeline_path,
      entry_count: final_timeline.length,
      timeline_entries: final_timeline,
      new_entries_added: update_existing
        ? final_timeline.length -
          (await get_existing_timeline_length(timeline_path))
        : final_timeline.length,
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

const convert_message_to_timeline_entry = (message, session_provider) => {
  // Track any unexpected message properties
  const known_message_keys = [
    'id',
    'type',
    'role',
    'content',
    'metadata',
    'provider_data',
    'timestamp',
    'parent_id',
    'tool_name',
    'parameters',
    'result',
    'tool_id',
    'thinking_type',
    'system_type'
  ]
  Object.keys(message).forEach((key) => {
    if (!known_message_keys.includes(key)) {
      log_timeline_unsupported(
        'metadata_fields',
        key,
        `in ${message.type} message`
      )
    }
  })

  const base_entry = {
    id: message.id,
    timestamp: message.timestamp.toISOString(),
    session_provider,
    provider_data: message.provider_data || {}
  }

  switch (message.type) {
    case 'message':
      return {
        ...base_entry,
        type: 'message',
        role: message.role,
        content: format_message_content(message.content),
        metadata: {
          ...message.metadata
        }
      }

    case 'tool_call':
      return {
        ...base_entry,
        type: 'tool_call',
        content: {
          tool_name: message.tool_name,
          tool_parameters: message.parameters,
          tool_call_id: message.tool_id,
          execution_status: message.execution_status || 'pending',
          result_preview: message.result_preview || null
        },
        metadata: {
          ...message.metadata
        }
      }

    case 'tool_result':
      return {
        ...base_entry,
        type: 'tool_result',
        content: {
          tool_call_id: message.tool_id,
          result: message.result,
          error: message.error || null
        },
        metadata: {
          ...message.metadata
        }
      }

    case 'system':
      return {
        ...base_entry,
        type: 'system',
        content: message.content,
        system_type: message.system_type || 'status',
        metadata: {
          ...message.metadata
        }
      }

    case 'thinking':
      return {
        ...base_entry,
        type: 'thinking',
        content: message.content,
        thinking_type: message.thinking_type || 'reasoning',
        metadata: {
          ...message.metadata
        }
      }

    case 'state_change':
      return {
        ...base_entry,
        type: 'state_change',
        previous_state: message.previous_state || 'unknown',
        new_state: message.new_state || 'unknown',
        reason: message.reason || message.content,
        metadata: {
          ...message.metadata
        }
      }

    case 'error':
      return {
        ...base_entry,
        type: 'error',
        error_type: message.error_type || 'unknown',
        message: message.content || message.message,
        details: message.details || {},
        metadata: {
          ...message.metadata
        }
      }

    case 'unknown':
      return {
        ...base_entry,
        type: 'system',
        content: `Unsupported message type: ${message.metadata?.original_type || 'unknown'}\n${message.content}`,
        system_type: 'status',
        metadata: {
          unsupported_message_type: message.metadata?.original_type,
          ...message.metadata
        }
      }

    default:
      log_timeline_unsupported('message_types', message.type)
      return {
        ...base_entry,
        type: 'system',
        content: `Unknown message type: ${message.type}\n${JSON.stringify(message, null, 2)}`,
        system_type: 'status',
        metadata: {
          original_type: message.type,
          unsupported_conversion: true,
          ...message.metadata
        }
      }
  }
}

const format_message_content = (content) => {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    // Check if this is structured content blocks
    const has_content_blocks = content.some(
      (item) =>
        typeof item === 'object' &&
        item.type &&
        [
          'text',
          'thinking',
          'thinking.thinking',
          'thinking.signature',
          'tool_use',
          'tool_result',
          'image',
          'code'
        ].includes(item.type)
    )

    if (has_content_blocks) {
      // Return as structured content blocks for schema compliance
      return content.map((item) => {
        if (typeof item === 'string') {
          return {
            type: 'text',
            content: item
          }
        }

        if (typeof item === 'object' && item.type) {
          switch (item.type) {
            case 'text':
            case 'thinking':
            case 'thinking.thinking':
            case 'thinking.signature':
            case 'tool_use':
            case 'tool_result':
            case 'code':
              return {
                type: item.type,
                content: item.content || item.text || JSON.stringify(item),
                metadata: item.metadata || {}
              }
            case 'image':
              return {
                type: 'image',
                content: item.content || '[Image]',
                metadata: {
                  source_type: item.metadata?.source_type || 'unknown',
                  media_type: item.metadata?.media_type || 'image/*',
                  ...item.metadata
                }
              }
            case 'tool_call':
              return {
                type: 'tool_use',
                content: `Tool: ${item.tool_name}\nParameters: ${JSON.stringify(item.parameters, null, 2)}`,
                metadata: { tool_name: item.tool_name, tool_id: item.tool_id }
              }
            default:
              log_timeline_unsupported(
                'content_formats',
                item.type,
                'in message content array'
              )
              return {
                type: 'text',
                content: JSON.stringify(item, null, 2),
                metadata: { unsupported_type: item.type }
              }
          }
        }

        return {
          type: 'text',
          content: JSON.stringify(item, null, 2)
        }
      })
    } else {
      // Legacy format - convert to simple text
      return content
        .map((item) => {
          if (typeof item === 'string') {
            return item
          }
          return JSON.stringify(item, null, 2)
        })
        .join('\n\n')
    }
  }

  // Handle object content (non-array)
  if (typeof content === 'object' && content !== null) {
    if (content.type) {
      log_timeline_unsupported(
        'content_formats',
        content.type,
        'in message content object'
      )
    }
    return JSON.stringify(content, null, 2)
  }

  return JSON.stringify(content, null, 2)
}

const merge_with_existing_timeline = async (
  timeline_path,
  new_entries,
  normalized_session
) => {
  try {
    // Read existing timeline if it exists
    const existing_timeline = await read_existing_timeline(timeline_path)
    if (!existing_timeline || existing_timeline.length === 0) {
      log('No existing timeline found, creating new timeline')
      return new_entries
    }

    log(`Found existing timeline with ${existing_timeline.length} entries`)

    // Create a map of existing entries by ID for fast lookup
    const existing_entries_map = new Map()
    existing_timeline.forEach((entry) => {
      if (entry.id) {
        existing_entries_map.set(entry.id, entry)
      }
    })

    // Track new entries that don't exist yet
    const new_unique_entries = []
    let updated_entries = 0

    for (const new_entry of new_entries) {
      if (existing_entries_map.has(new_entry.id)) {
        // Entry already exists - check if it needs updating
        const existing_entry = existing_entries_map.get(new_entry.id)
        if (JSON.stringify(existing_entry) !== JSON.stringify(new_entry)) {
          // Update the existing entry with new data
          existing_entries_map.set(new_entry.id, new_entry)
          updated_entries++
          log(`Updated existing timeline entry: ${new_entry.id}`)
        }
      } else {
        // This is a new entry
        new_unique_entries.push(new_entry)
      }
    }

    // Combine existing and new entries
    const all_entries = Array.from(existing_entries_map.values()).concat(
      new_unique_entries
    )

    // Sort by timestamp
    all_entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    log(
      `Timeline merge complete: ${new_unique_entries.length} new entries added, ${updated_entries} entries updated`
    )

    return all_entries
  } catch (error) {
    log(`Error merging timeline, creating new timeline: ${error.message}`)
    return new_entries
  }
}

const read_existing_timeline = async (timeline_path) => {
  try {
    const timeline_content = await fs.readFile(timeline_path, 'utf-8')
    return JSON.parse(timeline_content)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null // File doesn't exist
    }
    log(`Error reading existing timeline: ${error.message}`)
    return null
  }
}

const get_existing_timeline_length = async (timeline_path) => {
  try {
    const existing_timeline = await read_existing_timeline(timeline_path)
    return existing_timeline ? existing_timeline.length : 0
  } catch (error) {
    return 0
  }
}

export const create_timeline_summary = (timeline_entries) => {
  const entry_types = timeline_entries.reduce((counts, entry) => {
    counts[entry.type] = (counts[entry.type] || 0) + 1
    return counts
  }, {})

  const timestamps = timeline_entries.map((entry) => new Date(entry.timestamp))
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
