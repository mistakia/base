import debug from 'debug'
import { WebSocket } from 'ws'

import wss from '#server/websocket.mjs'
import { check_thread_permission_for_user } from '#server/middleware/permission/index.mjs'
import { redact_thread_data } from '#server/middleware/content-redactor.mjs'
import { get_thread_subscribers } from '#libs-server/thread-subscriptions/index.mjs'

const log = debug('threads:events')

/**
 * Central utility for emitting thread-related WebSocket events
 *
 * Events are sent to all connected WebSocket clients with permission-based
 * redaction applied:
 * - Thread owner receives full unredacted data
 * - Authenticated users with permission receive full unredacted data
 * - Authenticated users without permission receive redacted data (structure preserved)
 * - Unauthenticated clients receive redacted data (structure preserved)
 *
 * For THREAD_TIMELINE_ENTRY_ADDED, tiered delivery applies:
 * - Subscribed clients receive the full entry payload
 * - Non-subscribed clients receive a truncated payload with summary fields only
 *
 * This follows the same pattern as HTTP API responses where data is
 * redacted rather than filtered entirely.
 */

// ============================================================================
// Truncation Utilities
// ============================================================================

const TRUNCATED_CONTENT_MAX_LENGTH = 80

/**
 * Extract minimal tool input fields needed by CompactTimelineEvent's get_tool_summary
 */
const extract_minimal_tool_input = ({ tool_name, tool_input }) => {
  if (!tool_input) return {}

  switch (tool_name) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return tool_input.file_path ? { file_path: tool_input.file_path } : {}

    case 'Glob':
    case 'Grep':
      return tool_input.pattern ? { pattern: tool_input.pattern } : {}

    case 'Bash':
      if (tool_input.command) {
        const first_line = tool_input.command.split('\n')[0]
        return { command: first_line }
      }
      return {}

    case 'Task':
      return tool_input.description
        ? { description: tool_input.description }
        : {}

    case 'WebSearch':
      return tool_input.query ? { query: tool_input.query } : {}

    case 'WebFetch':
      return tool_input.url ? { url: tool_input.url } : {}

    case 'NotebookEdit':
      return tool_input.notebook_path
        ? { notebook_path: tool_input.notebook_path }
        : {}

    default:
      return {}
  }
}

/**
 * Create a truncated timeline entry containing only the fields needed for
 * summary display in CompactTimelineEvent.
 *
 * Preserves: id, type, role, truncated flag, and minimal content for get_event_summary()
 */
const create_truncated_entry = (entry) => {
  const truncated = {
    id: entry.id,
    type: entry.type,
    role: entry.role,
    truncated: true
  }

  switch (entry.type) {
    case 'message': {
      const { content } = entry
      if (typeof content === 'string') {
        const clean = content.replace(/<[^>]+>/g, '').trim()
        truncated.content =
          clean.length > TRUNCATED_CONTENT_MAX_LENGTH
            ? clean.substring(0, TRUNCATED_CONTENT_MAX_LENGTH)
            : clean
      } else if (Array.isArray(content)) {
        const text_blocks = content.filter((b) => b.type === 'text')
        if (text_blocks.length > 0) {
          const text = text_blocks[0].text || ''
          truncated.content =
            text.length > TRUNCATED_CONTENT_MAX_LENGTH
              ? text.substring(0, TRUNCATED_CONTENT_MAX_LENGTH)
              : text
        }
      }
      break
    }

    case 'tool_call':
    case 'tool_use': {
      const tool_name = entry.content?.tool_name
      const tool_input =
        entry.content?.tool_parameters || entry.content?.input || {}
      truncated.content = {
        tool_name,
        ...(entry.content?.tool_parameters
          ? {
              tool_parameters: extract_minimal_tool_input({
                tool_name,
                tool_input
              })
            }
          : {
              input: extract_minimal_tool_input({ tool_name, tool_input })
            })
      }
      break
    }

    case 'tool_result':
      truncated.content = { error: Boolean(entry.content?.error) }
      break

    case 'error':
      truncated.content = entry.content?.message
        ? { message: entry.content.message }
        : {}
      break

    default:
      break
  }

  return truncated
}

// ============================================================================
// Batching for Non-Subscribed Clients
// ============================================================================

const BATCH_FLUSH_INTERVAL_MS = 200

// Buffer of latest truncated payload per thread for non-subscribed delivery
// Map<thread_id, { truncated_payload, full_payload_metadata }>
const batch_buffer = new Map()

// Active flush timers per thread
// Map<thread_id, NodeJS.Timeout>
const batch_timers = new Map()

/**
 * Flush buffered truncated entries to all non-subscribed clients for a thread.
 * Performs permission checking and redaction per client.
 */
const flush_batch_for_thread = async (thread_id) => {
  const buffered = batch_buffer.get(thread_id)
  batch_buffer.delete(thread_id)
  batch_timers.delete(thread_id)

  if (!buffered) return

  const event_type = 'THREAD_TIMELINE_ENTRY_ADDED'
  const { truncated_payload } = buffered
  const subscribers = get_thread_subscribers(thread_id)

  try {
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue

      // Skip subscribed clients - they already received immediate delivery
      if (subscribers.has(client)) continue

      if (!client.user_public_key) {
        const redacted_payload = redact_event_payload({
          payload: truncated_payload,
          event_type
        })
        try {
          client.send(
            JSON.stringify({ type: event_type, payload: redacted_payload })
          )
        } catch (send_error) {
          log('Failed to send batched event to unauthenticated client:', send_error)
        }
        continue
      }

      try {
        const permission_result = await check_thread_permission_for_user({
          user_public_key: client.user_public_key,
          thread_id
        })

        let event_to_send
        if (permission_result.allowed) {
          event_to_send = { type: event_type, payload: truncated_payload }
        } else {
          const redacted_payload = redact_event_payload({
            payload: truncated_payload,
            event_type
          })
          event_to_send = { type: event_type, payload: redacted_payload }
        }

        client.send(JSON.stringify(event_to_send))
      } catch (permission_error) {
        log(
          `Permission check failed during batch flush for ${client.user_public_key}:`,
          permission_error
        )
      }
    }
  } catch (error) {
    log(`Failed to flush batch for thread ${thread_id}:`, error)
  }
}

/**
 * Buffer a truncated payload for batched delivery to non-subscribed clients.
 * Only the latest entry per thread is kept. Flushes after BATCH_FLUSH_INTERVAL_MS.
 */
const buffer_for_non_subscribed = ({ thread_id, truncated_payload }) => {
  // Update buffer with latest payload (overwrites previous if exists)
  batch_buffer.set(thread_id, { truncated_payload })

  // Set flush timer if not already pending
  if (!batch_timers.has(thread_id)) {
    const timer = setTimeout(() => {
      flush_batch_for_thread(thread_id)
    }, BATCH_FLUSH_INTERVAL_MS)
    batch_timers.set(thread_id, timer)
  }
}

// ============================================================================
// Core Event Emitter
// ============================================================================

/**
 * Emit a thread event via WebSocket with permission-based redaction
 *
 * Iterates through all connected WebSocket clients and sends the event
 * with appropriate redaction based on user permissions. Users without
 * permission receive a redacted version preserving structure but hiding
 * sensitive content.
 *
 * @param {Object} params - Event parameters
 * @param {string} params.thread_id - Thread ID for permission checking
 * @param {string} params.event_type - Redux action type (e.g., 'THREAD_CREATED')
 * @param {Object} params.payload - Event payload data
 */
const emit_thread_event = async ({ thread_id, event_type, payload }) => {
  try {
    if (!thread_id) {
      log(`Cannot emit ${event_type} - no thread_id provided`)
      return
    }

    // Iterate through all connected WebSocket clients
    for (const client of wss.clients) {
      // Skip clients that are not open
      if (client.readyState !== WebSocket.OPEN) {
        continue
      }

      let event_to_send

      // Handle unauthenticated clients - send redacted events
      if (!client.user_public_key) {
        const redacted_payload = redact_event_payload({
          payload,
          event_type
        })
        event_to_send = { type: event_type, payload: redacted_payload }

        try {
          client.send(JSON.stringify(event_to_send))
        } catch (send_error) {
          log('Failed to send to unauthenticated client:', send_error)
        }
        continue
      }

      // Handle authenticated clients - check permission
      try {
        const permission_result = await check_thread_permission_for_user({
          user_public_key: client.user_public_key,
          thread_id
        })

        if (permission_result.allowed) {
          // User has permission - send full unredacted event
          event_to_send = { type: event_type, payload }
        } else {
          // User lacks permission - send redacted event
          const redacted_payload = redact_event_payload({
            payload,
            event_type
          })
          event_to_send = { type: event_type, payload: redacted_payload }
        }

        client.send(JSON.stringify(event_to_send))
      } catch (permission_error) {
        log(
          `Permission check failed for ${client.user_public_key}:`,
          permission_error
        )
        // On permission check failure, skip this client to avoid leaking data
      }
    }
  } catch (error) {
    log(`Failed to emit ${event_type}:`, error)
    // Don't throw - WebSocket failures shouldn't block operations
  }
}

/**
 * Emit a THREAD_TIMELINE_ENTRY_ADDED event with tiered delivery.
 *
 * - Subscribed clients receive the full entry payload immediately
 * - Non-subscribed clients receive a truncated payload, batched within a
 *   200ms window per thread (only the latest entry per thread is sent)
 * - Permission-based redaction still applies to both tiers
 *
 * @param {Object} params - Event parameters
 * @param {string} params.thread_id - Thread ID
 * @param {Object} params.payload - Event payload with entry data
 */
const emit_timeline_entry_tiered = async ({ thread_id, payload }) => {
  const event_type = 'THREAD_TIMELINE_ENTRY_ADDED'

  try {
    if (!thread_id) {
      log(`Cannot emit ${event_type} - no thread_id provided`)
      return
    }

    const subscribers = get_thread_subscribers(thread_id)

    // Pre-compute truncated payload for non-subscribed clients
    const truncated_entry = create_truncated_entry(payload.entry)
    const truncated_payload = { ...payload, entry: truncated_entry }

    // Immediate delivery to subscribed clients (full payload)
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue
      if (!subscribers.has(client)) continue

      if (!client.user_public_key) {
        const redacted_payload = redact_event_payload({
          payload,
          event_type
        })
        try {
          client.send(
            JSON.stringify({ type: event_type, payload: redacted_payload })
          )
        } catch (send_error) {
          log('Failed to send to unauthenticated subscribed client:', send_error)
        }
        continue
      }

      try {
        const permission_result = await check_thread_permission_for_user({
          user_public_key: client.user_public_key,
          thread_id
        })

        let event_to_send
        if (permission_result.allowed) {
          event_to_send = { type: event_type, payload }
        } else {
          const redacted_payload = redact_event_payload({
            payload,
            event_type
          })
          event_to_send = { type: event_type, payload: redacted_payload }
        }

        client.send(JSON.stringify(event_to_send))
      } catch (permission_error) {
        log(
          `Permission check failed for ${client.user_public_key}:`,
          permission_error
        )
      }
    }

    // Buffer truncated payload for batched delivery to non-subscribed clients
    buffer_for_non_subscribed({ thread_id, truncated_payload })
  } catch (error) {
    log(`Failed to emit ${event_type}:`, error)
  }
}

/**
 * Redacts event payload based on event type
 *
 * Applies appropriate redaction for different event types to preserve
 * structure while hiding sensitive content.
 *
 * @param {Object} params
 * @param {Object} params.payload - Event payload to redact
 * @param {string} params.event_type - Type of event for context
 * @returns {Object} Redacted payload with is_redacted flag
 */
const redact_event_payload = ({ payload, event_type }) => {
  // Clone payload to avoid mutating original
  const redacted_payload = { ...payload, is_redacted: true }

  switch (event_type) {
    case 'THREAD_CREATED':
    case 'THREAD_UPDATED':
      // Redact thread object in payload
      if (redacted_payload.thread) {
        redacted_payload.thread = redact_thread_data(redacted_payload.thread)
      }
      break

    case 'THREAD_TIMELINE_ENTRY_ADDED':
      // Redact timeline entry in payload
      if (redacted_payload.entry) {
        // If already truncated, just mark as redacted
        if (redacted_payload.entry.truncated) {
          redacted_payload.entry = {
            ...redacted_payload.entry,
            is_redacted: true
          }
        } else {
          // Use the same redaction logic as timeline entries in thread data
          redacted_payload.entry = {
            ...redacted_payload.entry,
            is_redacted: true
          }
          // Redact entry content based on type using existing redaction utilities
          const redacted_thread = redact_thread_data({
            timeline: [redacted_payload.entry]
          })
          if (redacted_thread.timeline && redacted_thread.timeline.length > 0) {
            redacted_payload.entry = redacted_thread.timeline[0]
          }
        }
      }
      break

    default:
      // For unknown event types, mark as redacted
      log(`Unknown event type for redaction: ${event_type}`)
      break
  }

  return redacted_payload
}

// ============================================================================
// Thread Lifecycle Events
// ============================================================================

/**
 * Emit THREAD_CREATED event
 *
 * Sends event to all users with permission to view the thread based on:
 * - Thread ownership (user_public_key matches)
 * - Public read access (public_read: true)
 * - User-specific permission rules
 *
 * @param {Object} thread - Thread object with metadata including thread_id
 */
export const emit_thread_created = (thread) => {
  emit_thread_event({
    thread_id: thread.thread_id,
    event_type: 'THREAD_CREATED',
    payload: { thread }
  })
}

/**
 * Emit THREAD_UPDATED event
 *
 * Sends event to all users with permission to view the thread.
 *
 * @param {Object} thread - Updated thread object with thread_id
 */
export const emit_thread_updated = (thread) => {
  emit_thread_event({
    thread_id: thread.thread_id,
    event_type: 'THREAD_UPDATED',
    payload: { thread }
  })
}

/**
 * Emit THREAD_TIMELINE_ENTRY_ADDED event with tiered delivery
 *
 * Subscribed clients receive the full entry. Non-subscribed clients receive
 * a truncated entry with summary fields only.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Thread UUID
 * @param {Object} params.entry - Timeline entry object
 * @param {string} params.user_public_key - Thread owner (included in payload for context)
 * @param {string} [params.thread_title] - Thread title from metadata (falls back to thread_id if not available)
 */
export const emit_thread_timeline_entry_added = ({
  thread_id,
  entry,
  user_public_key,
  thread_title
}) => {
  emit_timeline_entry_tiered({
    thread_id,
    payload: { thread_id, entry, user_public_key, thread_title }
  })
}

// ============================================================================
// Future: Job Queue Events
// ============================================================================
/**
 * Job queue event emitters are not currently implemented because thread
 * entities don't exist when jobs run. Threads are created by a filesystem
 * hook AFTER the CLI session completes.
 *
 * Future job events would include:
 * - THREAD_JOB_QUEUED (job_id, queue_position)
 * - THREAD_JOB_STARTED (job_id)
 * - THREAD_JOB_COMPLETED (job_id)
 * - THREAD_JOB_FAILED (job_id, error)
 *
 * If needed, implement these following the pattern above.
 */
