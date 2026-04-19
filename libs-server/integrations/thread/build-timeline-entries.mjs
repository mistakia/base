import debug from 'debug'
import path from 'path'
import fs from 'fs/promises'

import {
  find_orphaned_tool_calls,
  find_orphaned_tool_results,
  link_tool_call_to_result
} from '#libs-server/integrations/shared/tool-extraction-utils.mjs'
import {
  append_timeline_entries,
  sort_timeline_entries
} from '#libs-server/threads/timeline/index.mjs'
import { TIMELINE_SCHEMA_VERSION } from '#libs-shared/timeline-schema-version.mjs'
import { deterministic_timeline_entry_id } from '#libs-shared/timeline/deterministic-id.mjs'
import { assert_thread_metadata_present } from '#libs-server/threads/assert-thread-metadata-present.mjs'

const EPOCH_ISO = '1970-01-01T00:00:00.000Z'

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

    // timeline.jsonl may only be written to a thread directory that already
    // has its metadata.json lifecycle anchor in place.
    await assert_thread_metadata_present({ thread_dir: thread_info.thread_dir })

    const timeline_entries = []

    // Convert session messages to timeline entries - these represent the actual session content
    for (const [index, message] of normalized_session.messages.entries()) {
      const entry = convert_message_to_timeline_entry({
        message,
        session_provider: normalized_session.session_provider,
        sequence_index: index,
        thread_id: thread_info.thread_id
      })
      if (entry) {
        timeline_entries.push(entry)
      }
    }

    const timeline_path = path.join(thread_info.thread_dir, 'timeline.jsonl')
    const final_timeline = timeline_entries

    // Sort timeline entries by timestamp (primary) with ordering.sequence as tie-breaker
    sort_timeline_entries(final_timeline)

    // Validate and report tool interaction quality
    const tool_validation = validate_tool_interactions(final_timeline)

    const parse_mode = normalized_session.parse_mode
    if (parse_mode !== 'full' && parse_mode !== 'delta') {
      throw new Error(
        `build_timeline_from_session: normalized_session.parse_mode must be 'full' or 'delta', got ${parse_mode}`
      )
    }

    const write_start = Date.now()
    let wrote = false
    if (parse_mode === 'full') {
      await fs.writeFile(timeline_path, '')
      if (final_timeline.length > 0) {
        await append_timeline_entries({
          timeline_path,
          entries: final_timeline
        })
      }
      wrote = true
    } else if (final_timeline.length > 0) {
      await append_timeline_entries({
        timeline_path,
        entries: final_timeline
      })
      wrote = true
    }
    const write_ms = Date.now() - write_start
    log(
      `Timeline write (parse_mode=${parse_mode}) with ${final_timeline.length} entries at ${timeline_path}`
    )
    log_perf(
      'build_timeline session=%s parse_mode=%s entries=%d write_ms=%d total_ms=%d',
      normalized_session.session_id,
      parse_mode,
      final_timeline.length,
      write_ms,
      Date.now() - timeline_start
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
      timeline_modified: wrote,
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
  sequence_index,
  thread_id
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

  // Normalize timestamp to ISO string. Entries without a valid timestamp
  // (e.g. file-history-snapshot) get EPOCH_ISO so id/timestamp remain
  // deterministic across re-imports.
  let iso_timestamp
  const ts = message.timestamp
  if (ts instanceof Date && !isNaN(ts.getTime())) {
    iso_timestamp = ts.toISOString()
  } else if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts)
    iso_timestamp = isNaN(d.getTime()) ? EPOCH_ISO : d.toISOString()
  } else {
    iso_timestamp = EPOCH_ISO
  }

  // Deterministic id fallback covers normalized messages whose upstream
  // source provided no id. Keyed on source_uuid so the id is stable across
  // full/delta re-imports of the same source bytes.
  const source_uuid = message.ordering?.source_uuid || ''
  const id =
    message.id ||
    deterministic_timeline_entry_id({
      thread_id,
      timestamp: iso_timestamp,
      type: message.type || 'message',
      system_type: message.system_type || message.role || '',
      source_uuid,
      // Providers that have not yet plumbed source_uuid (Cursor/ChatGPT
      // message-level ids are migrated in a sibling task) fall back to
      // sequence_index as a non-empty discriminator so the id stays
      // deterministic per-position within a single session import.
      discriminator: source_uuid ? '' : String(sequence_index)
    })

  const ordering = message.ordering
    ? { ...message.ordering }
    : { sequence: sequence_index, parent_id: message.parent_id || null }

  const base_entry = {
    id,
    timestamp: iso_timestamp,
    provider: session_provider,
    provider_data: message.provider_data || {},
    ordering,
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
          tool_name: message.content?.tool_name,
          tool_parameters: message.content?.tool_parameters,
          tool_call_id: message.content?.tool_call_id,
          execution_status: message.content?.execution_status ?? 'pending'
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
          tool_call_id: message.content?.tool_call_id,
          result: message.content?.result,
          error: message.content?.error ?? null
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
