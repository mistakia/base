import debug from 'debug'
import { WebSocket } from 'ws'

import wss from '#server/websocket.mjs'
import { check_thread_permission_for_user } from '#server/middleware/permission/index.mjs'
import { redact_session_data } from '#server/middleware/content-redactor.mjs'

const log = debug('active-sessions:events')

/**
 * WebSocket event emitter for active session changes
 *
 * Sessions with associated threads require permission checking:
 * - Thread owner receives full unredacted data
 * - Users with thread permission receive full unredacted data
 * - Users without permission receive redacted data (structure preserved)
 *
 * Sessions without threads have paths redacted for all non-owner users.
 */

// ============================================================================
// Core Event Emitter
// ============================================================================

/**
 * Emit an active session event via WebSocket with permission-based redaction
 *
 * For sessions with associated threads, checks each client's permission
 * and applies redaction for unauthorized users.
 *
 * @param {Object} params - Event parameters
 * @param {string} params.event_type - Redux action type
 * @param {Object} params.payload - Event payload data
 */
const emit_session_event = async ({ event_type, payload }) => {
  try {
    const session = payload.session
    const thread_id = session?.thread_id

    let sent_count = 0

    for (const client of wss.clients) {
      // Skip clients that are not open
      if (client.readyState !== WebSocket.OPEN) {
        continue
      }

      // Only send to authenticated clients
      if (!client.user_public_key) {
        continue
      }

      let session_to_send = session

      // Apply permission-based redaction if session has a thread
      if (session && thread_id) {
        try {
          const permission_result = await check_thread_permission_for_user({
            user_public_key: client.user_public_key,
            thread_id
          })

          if (!permission_result.allowed) {
            // User lacks permission - send redacted session
            session_to_send = redact_session_data(session)
          }
        } catch (permission_error) {
          log(
            `Permission check failed for ${client.user_public_key}:`,
            permission_error
          )
          // On permission check failure, send redacted to be safe
          session_to_send = redact_session_data(session)
        }
      } else if (session && !thread_id) {
        // Session without thread - redact paths for safety
        // (we can't verify ownership without a thread)
        session_to_send = redact_session_data(session)
      }

      const event_to_send = {
        type: event_type,
        payload: { ...payload, session: session_to_send }
      }

      try {
        client.send(JSON.stringify(event_to_send))
        sent_count++
      } catch (send_error) {
        log(`Failed to send to client: ${send_error.message}`)
      }
    }

    log(`Emitted ${event_type} to ${sent_count} clients`)
  } catch (error) {
    log(`Failed to emit ${event_type}:`, error)
    // Don't throw - WebSocket failures shouldn't block operations
  }
}

// ============================================================================
// Active Session Events
// ============================================================================

/**
 * Emit ACTIVE_SESSION_STARTED event
 *
 * Sent when a new Claude Code session begins (SessionStart hook)
 *
 * @param {Object} session - Active session record
 * @returns {Promise<void>}
 */
export const emit_active_session_started = async (session) => {
  return await emit_session_event({
    event_type: 'ACTIVE_SESSION_STARTED',
    payload: { session }
  })
}

/**
 * Emit ACTIVE_SESSION_UPDATED event
 *
 * Sent when a session status changes (activity detected or idle)
 *
 * @param {Object} session - Updated active session record
 * @returns {Promise<void>}
 */
export const emit_active_session_updated = async (session) => {
  return await emit_session_event({
    event_type: 'ACTIVE_SESSION_UPDATED',
    payload: { session }
  })
}

/**
 * Emit ACTIVE_SESSION_ENDED event
 *
 * Sent when a session ends (SessionEnd hook)
 *
 * @param {string} session_id - ID of the ended session
 * @returns {Promise<void>}
 */
export const emit_active_session_ended = async (session_id) => {
  return await emit_session_event({
    event_type: 'ACTIVE_SESSION_ENDED',
    payload: { session_id }
  })
}
