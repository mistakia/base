import debug from 'debug'
import path from 'path'
import crypto from 'crypto'
import { createReadStream } from 'fs'
import fs from 'fs/promises'

import {
  find_orphaned_tool_calls,
  find_orphaned_tool_results,
  link_tool_call_to_result
} from '#libs-server/integrations/shared/tool-extraction-utils.mjs'
import {
  write_timeline_jsonl,
  sort_timeline_entries
} from '#libs-server/threads/timeline/index.mjs'
import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'

const log = debug('integrations:thread:build-timeline-entries')
const log_debug = debug('integrations:thread:build-timeline-entries:debug')
const log_perf = debug('integrations:claude:perf')

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
  thread_info
) => {
  try {
    const timeline_start = Date.now()
    log_debug(
      `Building timeline for thread ${thread_info.thread_id} from ${normalized_session.session_provider} session`
    )

    const timeline_entries = []

    // Convert session messages to timeline entries - these represent the actual session content
    for (const [index, message] of normalized_session.messages.entries()) {
      const entry = convert_message_to_timeline_entry({
        message,
        session_provider: normalized_session.session_provider,
        sequence_index: index
      })
      if (entry) {
        timeline_entries.push(entry)
      }
    }

    // Always rebuild the timeline from normalized_session (the full source).
    // The previous merge path cached derived data and dropped late-session
    // entries, so every downstream consumer must recompute from upstream.
    const timeline_path = path.join(thread_info.thread_dir, 'timeline.jsonl')
    const final_timeline = timeline_entries

    // Sort timeline entries by timestamp (primary) with ordering.sequence as tie-breaker
    sort_timeline_entries(final_timeline)

    // Validate and report tool interaction quality
    const tool_validation = validate_tool_interactions(final_timeline)

    // Check if timeline actually changed before writing using hash comparison
    // to avoid allocating two massive JSON strings in memory
    const hash_start = Date.now()
    const existing_hash = await hash_file_streaming(timeline_path)
    const new_hash = hash_timeline_entries(final_timeline)
    const timeline_changed = existing_hash !== new_hash
    const hash_ms = Date.now() - hash_start

    if (timeline_changed) {
      // Write timeline to file only if it changed (using JSONL format)
      const write_start = Date.now()
      await write_timeline_jsonl({
        timeline_path,
        entries: final_timeline
      })
      const write_ms = Date.now() - write_start
      log(
        `Created/updated timeline with ${final_timeline.length} entries at ${timeline_path}`
      )
      log_perf(
        'build_timeline session=%s timeline_changed=true entries=%d merge_ms=%d hash_ms=%d write_ms=%d total_ms=%d',
        normalized_session.session_id,
        final_timeline.length,
        hash_start - timeline_start,
        hash_ms,
        write_ms,
        Date.now() - timeline_start
      )
    } else {
      log(
        `Timeline unchanged, skipping write for ${timeline_path} (${final_timeline.length} entries)`
      )
      log_perf(
        'build_timeline session=%s timeline_changed=false entries=%d merge_ms=%d hash_ms=%d total_ms=%d',
        normalized_session.session_id,
        final_timeline.length,
        hash_start - timeline_start,
        hash_ms,
        Date.now() - timeline_start
      )
    }

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

    // Log tool interaction validation results
    if (tool_validation.orphaned_calls.length > 0) {
      log(
        `Found ${tool_validation.orphaned_calls.length} orphaned tool calls (no matching results)`
      )
    }
    if (tool_validation.orphaned_results.length > 0) {
      log(
        `Found ${tool_validation.orphaned_results.length} orphaned tool results (no matching calls)`
      )
    }

    return {
      timeline_path,
      entry_count: final_timeline.length,
      timeline_modified: timeline_changed,
      tool_validation,
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

const convert_message_to_timeline_entry = ({
  message,
  session_provider,
  sequence_index
}) => {
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
    'ordering',
    // Legacy field support for backward compatibility
    'tool_name',
    'parameters',
    'result',
    'tool_id',
    'execution_status',
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

  // Normalize timestamp to ISO string regardless of input type
  let iso_timestamp
  const ts = message.timestamp
  if (ts instanceof Date && !isNaN(ts.getTime())) {
    iso_timestamp = ts.toISOString()
  } else if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts)
    iso_timestamp = isNaN(d.getTime())
      ? new Date().toISOString()
      : d.toISOString()
  } else {
    iso_timestamp = new Date().toISOString()
  }

  const base_entry = {
    id: message.id,
    timestamp: iso_timestamp,
    provider: session_provider,
    provider_data: message.provider_data || {},
    ordering: {
      sequence: sequence_index,
      parent_id: message.parent_id || null
    },
    schema_version: TIMELINE_SCHEMA_VERSION
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
          tool_name: message.content?.tool_name || message.tool_name,
          tool_parameters:
            message.content?.tool_parameters || message.parameters,
          tool_call_id: message.content?.tool_call_id || message.tool_id,
          execution_status:
            message.content?.execution_status ||
            message.execution_status ||
            'pending'
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
          tool_call_id: message.content?.tool_call_id || message.tool_id,
          result: message.content?.result || message.result,
          error: message.content?.error || message.error || null
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

    case 'state_change': {
      const from_state = message.previous_state || 'unknown'
      const to_state = message.new_state || 'unknown'
      const reason = message.reason || message.content
      const content = reason
        ? `${from_state} -> ${to_state}: ${reason}`
        : `${from_state} -> ${to_state}`
      return {
        ...base_entry,
        type: 'system',
        system_type: 'state_change',
        content,
        metadata: {
          from_state,
          to_state,
          ...(reason ? { reason } : {}),
          ...message.metadata
        }
      }
    }

    case 'error': {
      const error_type = message.error_type || 'unknown'
      const error_message = message.content || message.message || ''
      return {
        ...base_entry,
        type: 'system',
        system_type: 'error',
        content: `[${error_type}] ${error_message}`,
        metadata: {
          error_type,
          message: error_message,
          ...(message.details ? { details: message.details } : {}),
          ...message.metadata
        }
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

/**
 * Hash a file by streaming raw bytes through SHA-256.
 * Returns null if the file does not exist.
 */
const hash_file_streaming = async (file_path) => {
  try {
    await fs.access(file_path)
  } catch {
    return null
  }

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = createReadStream(file_path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Hash timeline entries incrementally without building one massive string.
 * Produces the same hash as hashing the JSONL file that write_timeline_jsonl
 * would produce (JSON.stringify(entry) + '\n' per entry).
 *
 * Note: relies on JSON.stringify producing deterministic key order for
 * same-shaped objects (guaranteed in V8). A mismatch only causes a harmless
 * re-write.
 */
const hash_timeline_entries = (entries) => {
  const hash = crypto.createHash('sha256')
  for (const entry of entries) {
    hash.update(JSON.stringify(entry) + '\n')
  }
  return hash.digest('hex')
}

/**
 * Validate tool interactions in timeline entries
 */
const validate_tool_interactions = (timeline_entries) => {
  const orphaned_calls = find_orphaned_tool_calls(timeline_entries)
  const orphaned_results = find_orphaned_tool_results(timeline_entries)

  const tool_calls = timeline_entries.filter(
    (entry) => entry.type === 'tool_call'
  )
  const tool_results = timeline_entries.filter(
    (entry) => entry.type === 'tool_result'
  )

  // Find successful tool interaction pairs
  const linked_pairs = []
  for (const call of tool_calls) {
    const call_id = call.content?.tool_call_id
    if (call_id) {
      const matching_result = tool_results.find(
        (result) => result.content?.tool_call_id === call_id
      )
      if (matching_result) {
        // Link tool call to result to update execution status and preview
        try {
          link_tool_call_to_result(call, matching_result)
        } catch (e) {
          log(
            `Error linking tool call to result for id ${call_id}: ${e.message}`
          )
        }
        linked_pairs.push({ call, result: matching_result })
      }
    }
  }

  log(
    `Tool interaction validation: ${tool_calls.length} calls, ${tool_results.length} results, ${linked_pairs.length} properly linked pairs`
  )

  return {
    tool_call_count: tool_calls.length,
    tool_result_count: tool_results.length,
    linked_pairs_count: linked_pairs.length,
    orphaned_calls,
    orphaned_results,
    linking_success_rate:
      tool_calls.length > 0 ? linked_pairs.length / tool_calls.length : 1
  }
}
