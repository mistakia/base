// import { v4 as uuidv4 } from 'uuid'
import debug from 'debug'

import {
  create_tool_call_entry,
  create_tool_result_entry
} from '#libs-server/integrations/shared/tool-extraction-utils.mjs'

const log = debug('integrations:claude:normalize-session')

// Track unsupported properties for future implementation
const UNSUPPORTED_TRACKING = {
  entry_types: new Set(),
  message_fields: new Set(),
  content_types: new Set(),
  tool_result_formats: new Set(),
  metadata_fields: new Set()
}

const log_unsupported = ({ category, value, context = '' }) => {
  if (!UNSUPPORTED_TRACKING[category].has(value)) {
    UNSUPPORTED_TRACKING[category].add(value)
    log(
      `UNSUPPORTED ${category.toUpperCase()}: ${value} ${context ? `(${context})` : ''}`
    )
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
    entries.forEach((entry) => {
      entry_map.set(entry.uuid, entry)
    })

    // Second pass: convert entries to normalized format
    let overall_sequence = 0
    entries.forEach((entry, index) => {
      const normalized_entry = normalize_claude_entry({
        entry,
        index
      })
      if (normalized_entry) {
        normalized_entry.ordering = {
          sequence: overall_sequence++,
          parent_id: entry.parentUuid || null
        }
        normalized_messages.push(normalized_entry)
      }

      // Check for thinking content that should be separate entries
      if (
        entry.type === 'assistant' &&
        entry.message?.content &&
        Array.isArray(entry.message.content)
      ) {
        entry.message.content.forEach((content_item, content_index) => {
          if (content_item.type && content_item.type.startsWith('thinking')) {
            // Create separate thinking entry
            const thinking_entry = {
              id: `${entry.uuid}-thinking-${content_index}`,
              parent_id: entry.uuid,
              timestamp: new Date(entry.timestamp),
              type: 'thinking',
              content:
                content_item.content ||
                content_item.text ||
                content_item.thinking,
              thinking_type:
                content_item.type === 'thinking.signature'
                  ? 'analysis'
                  : 'reasoning',
              metadata: {
                original_content_type: content_item.type,
                ...content_item.metadata
              },
              provider_data: {
                line_number: entry.line_number,
                session_index: index,
                is_sidechain: entry.isSidechain || false,
                content_block_index: content_index,
                is_thinking_block: true // Add marker to identify thinking blocks
              },
              ordering: {
                sequence: overall_sequence,
                parent_id: entry.uuid
              }
            }
            overall_sequence++ // Increment after creating the entry
            normalized_messages.push(thinking_entry)
          }
        })
      }

      // Check for tool_use content that should be separate entries
      if (
        entry.type === 'assistant' &&
        entry.message?.content &&
        Array.isArray(entry.message.content)
      ) {
        entry.message.content.forEach((content_item, content_index) => {
          if (content_item.type === 'tool_use') {
            // Handle both raw Claude API format and processed format
            const tool_name =
              content_item.metadata?.tool_name || content_item.name
            const tool_parameters =
              content_item.metadata?.parameters || content_item.input || {}
            const tool_call_id =
              content_item.metadata?.tool_id || content_item.id

            if (!tool_name || !tool_call_id) {
              log(
                `Warning: Incomplete tool_use data in session ${index}, content block ${content_index}`
              )
              return // Skip this tool use
            }

            // Create separate tool call entry
            const tool_call_entry = create_tool_call_entry({
              parent_id: entry.uuid,
              tool_name,
              tool_parameters,
              tool_call_id,
              timestamp: new Date(entry.timestamp),
              provider_data: {
                line_number: entry.line_number,
                session_index: index,
                is_sidechain: entry.isSidechain || false,
                content_block_index: content_index,
                is_extracted_tool: true
              },
              sequence_index: overall_sequence
            })

            if (tool_call_entry) {
              overall_sequence++ // Increment after creating the entry
              normalized_messages.push(tool_call_entry)
            }
          }
        })
      }

      // Check for tool_result content in user messages
      if (
        entry.type === 'user' &&
        entry.message?.content &&
        Array.isArray(entry.message.content)
      ) {
        entry.message.content.forEach((content_item, content_index) => {
          if (content_item.type === 'tool_result') {
            // Create separate tool result entry
            const tool_result_entry = create_tool_result_entry({
              tool_call_id: content_item.tool_use_id,
              result: content_item.content,
              error: content_item.is_error ? content_item.content : null,
              timestamp: new Date(entry.timestamp),
              provider_data: {
                line_number: entry.line_number,
                session_index: index,
                is_sidechain: entry.isSidechain || false,
                content_block_index: content_index,
                is_extracted_tool: true
              },
              sequence_index: overall_sequence
            })

            if (tool_result_entry) {
              overall_sequence++ // Increment after creating the entry
              normalized_messages.push(tool_result_entry)
            }
          }
        })
      }
    })

    // Sort by ordering sequence to ensure correct timeline order
    normalized_messages.sort((a, b) => {
      const seq_a = a.ordering?.sequence ?? 0
      const seq_b = b.ordering?.sequence ?? 0

      return seq_a - seq_b
    })

    // Extract session metadata
    const session_metadata = extract_session_metadata(entries, metadata)

    return {
      session_id,
      session_provider: 'claude',
      messages: normalized_messages,
      metadata: session_metadata
    }
  } catch (error) {
    log(
      `Error normalizing Claude session ${claude_session.session_id}: ${error.message}`
    )
    throw error
  }
}

const normalize_claude_entry = ({ entry, index }) => {
  // Track all properties found in the entry for completeness analysis
  const all_entry_keys = Object.keys(entry)
  const known_keys = [
    'uuid',
    'parentUuid',
    'timestamp',
    'type',
    'message',
    'cwd',
    'userType',
    'requestId',
    'isSidechain',
    'line_number',
    'summary',
    'leafUuid',
    'toolUseResult',
    'version',
    'sessionId',
    'content',
    'isMeta',
    'isApiErrorMessage',
    'gitBranch',
    'isCompactSummary',
    'level',
    'metadata',
    'parse_line_number',
    'toolUseID'
  ]

  all_entry_keys.forEach((key) => {
    if (!known_keys.includes(key)) {
      log_unsupported({
        category: 'metadata_fields',
        value: key,
        context: `in ${entry.type} entry`
      })
    }
  })

  const base_normalized = {
    id: entry.uuid,
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
        type: 'system',
        content: entry.summary,
        system_type: 'status',
        metadata: {
          summary_type: 'session_summary',
          leaf_uuid: entry.leafUuid
        }
      }

    case 'system':
      return {
        ...base_normalized,
        type: 'system',
        content: entry.content || entry.message?.content || '',
        system_type: 'status',
        metadata: {
          is_meta: entry.isMeta || false,
          is_api_error_message: entry.isApiErrorMessage || false,
          git_branch: entry.gitBranch || null,
          is_compact_summary: entry.isCompactSummary || false,
          level: entry.level || null,
          ...entry.metadata
        }
      }

    default:
      log_unsupported({ category: 'entry_types', value: entry.type })
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

const is_system_interrupt_message = (content) => {
  if (typeof content === 'string') {
    return content.trim() === '[Request interrupted by user]'
  }

  if (Array.isArray(content) && content.length === 1) {
    const first_item = content[0]
    if (typeof first_item === 'string') {
      return first_item.trim() === '[Request interrupted by user]'
    }
    if (first_item?.type === 'text' && first_item?.text) {
      return first_item.text.trim() === '[Request interrupted by user]'
    }
  }

  return false
}

const extract_interrupt_content = (content) => {
  // Extract clean content from interrupt pattern, removing brackets
  return 'Request interrupted by user'
}

const normalize_user_entry = (entry, base_normalized) => {
  // Check if this is a system interrupt message disguised as user message
  const message_content = entry.message?.content
  if (is_system_interrupt_message(message_content)) {
    return {
      ...base_normalized,
      type: 'system',
      content: extract_interrupt_content(message_content),
      system_type: 'status',
      metadata: {
        original_type: 'user',
        is_interrupt: true,
        working_directory: entry.cwd,
        user_type: entry.userType,
        tool_use_result: entry.toolUseResult || null,
        is_meta: entry.isMeta || false,
        is_api_error_message: entry.isApiErrorMessage || false,
        git_branch: entry.gitBranch || null,
        is_compact_summary: entry.isCompactSummary || false,
        level: entry.level || null,
        parse_line_number: entry.parse_line_number || null,
        toolUseID: entry.toolUseID || null,
        original_content: message_content
      }
    }
  }

  // Analyze user message structure
  if (entry.message?.content && Array.isArray(entry.message.content)) {
    entry.message.content.forEach((content_item) => {
      if (
        content_item.type &&
        ![
          'text',
          'tool_result',
          'thinking',
          'thinking.thinking',
          'thinking.signature',
          'image'
        ].includes(content_item.type)
      ) {
        log_unsupported({
          category: 'content_types',
          value: content_item.type,
          context: 'user message content'
        })
      }
    })
  }

  const content = extract_user_content(entry.message)

  // Skip messages with empty content (e.g., messages that only contained tool_result blocks)
  if (
    !content ||
    (typeof content === 'string' && content.trim() === '') ||
    (Array.isArray(content) && content.length === 0)
  ) {
    return null
  }

  return {
    ...base_normalized,
    type: 'message',
    role: 'user',
    content,
    metadata: {
      working_directory: entry.cwd,
      user_type: entry.userType,
      tool_use_result: entry.toolUseResult || null,
      is_meta: entry.isMeta || false,
      is_api_error_message: entry.isApiErrorMessage || false,
      git_branch: entry.gitBranch || null,
      is_compact_summary: entry.isCompactSummary || false,
      level: entry.level || null,
      parse_line_number: entry.parse_line_number || null,
      toolUseID: entry.toolUseID || null
    }
  }
}

const normalize_assistant_entry = (entry, base_normalized) => {
  // Track assistant message fields
  const message = entry.message || {}
  const known_message_keys = [
    'role',
    'content',
    'model',
    'usage',
    'stop_reason',
    'stop_sequence',
    'id',
    'type'
  ]

  Object.keys(message).forEach((key) => {
    if (!known_message_keys.includes(key)) {
      log_unsupported({
        category: 'message_fields',
        value: key,
        context: 'assistant message'
      })
    }
  })

  // Track usage fields
  if (message.usage) {
    const known_usage_keys = [
      'input_tokens',
      'output_tokens',
      'cache_read_input_tokens',
      'cache_creation_input_tokens',
      'service_tier',
      'server_tool_use'
    ]
    Object.keys(message.usage).forEach((key) => {
      if (!known_usage_keys.includes(key)) {
        log_unsupported({
          category: 'message_fields',
          value: `usage.${key}`,
          context: 'assistant usage data'
        })
      }
    })
  }

  const content = extract_assistant_content(entry.message)

  // Skip messages with empty content (e.g., messages that only contained tool_use blocks)
  if (
    !content ||
    (typeof content === 'string' && content.trim() === '') ||
    (Array.isArray(content) && content.length === 0)
  ) {
    return null
  }

  return {
    ...base_normalized,
    type: 'message',
    role: 'assistant',
    content,
    metadata: {
      model: entry.message?.model,
      request_id: entry.requestId,
      usage: entry.message?.usage,
      stop_reason: entry.message?.stop_reason,
      stop_sequence: entry.message?.stop_sequence,
      is_meta: entry.isMeta || false,
      is_api_error_message: entry.isApiErrorMessage || false,
      git_branch: entry.gitBranch || null,
      is_compact_summary: entry.isCompactSummary || false,
      level: entry.level || null,
      parse_line_number: entry.parse_line_number || null,
      toolUseID: entry.toolUseID || null
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
    return message.content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        switch (item.type) {
          case 'text':
            return item.text || item.content
          case 'tool_result':
            // Tool results are extracted as separate entries, skip them in message content
            return null
          case 'thinking':
          case 'thinking.thinking':
          case 'thinking.signature':
            return {
              type: item.type,
              content: item.content || item.text || item.thinking,
              metadata: item.metadata || {}
            }
          case 'image':
            return {
              type: 'image',
              content: item.source?.data || item.content || '[Image]',
              metadata: {
                source_type: item.source?.type,
                media_type: item.source?.media_type,
                ...item.metadata
              }
            }
          default:
            log_unsupported({
              category: 'content_types',
              value: item.type,
              context: 'user message content item'
            })
            return JSON.stringify(item)
        }
      })
      .filter((item) => item !== null)
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
    return message.content
      .map((item) => {
        // Track all properties in content items
        if (typeof item === 'object' && item.type) {
          const known_content_keys = [
            'type',
            'text',
            'name',
            'id',
            'input',
            'content',
            'thinking',
            'metadata',
            'source' // for images
          ]
          Object.keys(item).forEach((key) => {
            if (!known_content_keys.includes(key)) {
              log_unsupported({
                category: 'content_types',
                value: `${item.type}.${key}`,
                context: 'assistant content property'
              })
            }
          })
        }

        switch (item.type) {
          case 'text':
            return item.text
          case 'tool_use':
            // Tool calls are extracted as separate entries, skip them in message content
            return null
          case 'thinking':
          case 'thinking.thinking':
          case 'thinking.signature':
            // Thinking blocks are extracted as separate entries, skip them in message content
            return null
          case 'image':
            return {
              type: 'image',
              content: item.source?.data || item.content || '[Image]',
              metadata: {
                source_type: item.source?.type,
                media_type: item.source?.media_type,
                ...item.metadata
              }
            }
          default:
            if (item.type) {
              log_unsupported({
                category: 'content_types',
                value: item.type,
                context: 'assistant message content'
              })
            }
            return JSON.stringify(item)
        }
      })
      .filter((item) => item !== null)
  }

  return JSON.stringify(message.content)
}

const extract_session_metadata = (entries, file_metadata) => {
  const timestamps = entries
    .map((e) => new Date(e.timestamp))
    .filter((d) => !isNaN(d))
  const start_time =
    timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null
  const end_time =
    timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null

  // Extract model information from assistant messages
  const models = new Set()
  const total_tokens = entries.reduce((total, entry) => {
    if (entry.type === 'assistant' && entry.message?.usage?.input_tokens) {
      const usage = entry.message.usage
      if (entry.message.model) {
        models.add(entry.message.model)
      }
      return (
        total +
        (usage.input_tokens || 0) +
        (usage.output_tokens || 0) +
        (usage.cache_read_input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0)
      )
    }
    return total
  }, 0)

  // Find summaries for session description
  const summaries = entries
    .filter((e) => e.type === 'summary')
    .map((e) => e.summary)

  // Always return models as an array
  const models_array = Array.from(models)

  return {
    session_provider: 'claude',
    models: models_array,
    working_directory: file_metadata.cwd,
    claude_version: file_metadata.version,
    user_type: file_metadata.user_type,
    start_time,
    end_time,
    duration_minutes:
      start_time && end_time ? (end_time - start_time) / (1000 * 60) : null,
    total_tokens,
    entry_count: entries.length,
    summaries,
    file_source: file_metadata.file_path
  }
}

export const normalize_claude_sessions = (claude_sessions) => {
  log(`Normalizing ${claude_sessions.length} Claude sessions`)

  const normalized_sessions = claude_sessions
    .map((session) => {
      try {
        return normalize_claude_session(session)
      } catch (error) {
        log(
          `Failed to normalize session ${session.session_id}: ${error.message}`
        )
        return null
      }
    })
    .filter(Boolean)

  log(`Successfully normalized ${normalized_sessions.length} sessions`)

  // Log summary of unsupported items found
  if (UNSUPPORTED_TRACKING.entry_types.size > 0) {
    log(
      `Summary: Found ${UNSUPPORTED_TRACKING.entry_types.size} unsupported entry types: ${Array.from(UNSUPPORTED_TRACKING.entry_types).join(', ')}`
    )
  }
  if (UNSUPPORTED_TRACKING.content_types.size > 0) {
    log(
      `Summary: Found ${UNSUPPORTED_TRACKING.content_types.size} unsupported content types: ${Array.from(UNSUPPORTED_TRACKING.content_types).join(', ')}`
    )
  }
  if (UNSUPPORTED_TRACKING.message_fields.size > 0) {
    log(
      `Summary: Found ${UNSUPPORTED_TRACKING.message_fields.size} unsupported message fields: ${Array.from(UNSUPPORTED_TRACKING.message_fields).join(', ')}`
    )
  }

  return normalized_sessions
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
