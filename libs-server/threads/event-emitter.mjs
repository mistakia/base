import debug from 'debug'
import { WebSocket } from 'ws'

import wss from '#server/websocket.mjs'
import { check_thread_permission_for_user } from '#server/middleware/permission/index.mjs'
import { redact_thread_data } from '#server/middleware/content-redactor.mjs'

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
 * This follows the same pattern as HTTP API responses where data is
 * redacted rather than filtered entirely.
 */

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
 * Emit THREAD_TIMELINE_ENTRY_ADDED event
 *
 * Sends event to all users with permission to view the thread.
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
  emit_thread_event({
    thread_id,
    event_type: 'THREAD_TIMELINE_ENTRY_ADDED',
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
