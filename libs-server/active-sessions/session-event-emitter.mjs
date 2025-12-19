import debug from 'debug'
import { WebSocket } from 'ws'

import wss from '#server/websocket.mjs'

const log = debug('active-sessions:events')

/**
 * WebSocket event emitter for active session changes
 *
 * Unlike thread events which require permission checking, active session
 * events are broadcast to all authenticated users since sessions are
 * transient and don't contain sensitive content.
 */

// ============================================================================
// Core Event Emitter
// ============================================================================

/**
 * Emit an active session event via WebSocket to all authenticated clients
 *
 * @param {Object} params - Event parameters
 * @param {string} params.event_type - Redux action type
 * @param {Object} params.payload - Event payload data
 */
const emit_session_event = ({ event_type, payload }) => {
  try {
    const event = { type: event_type, payload }
    const event_json = JSON.stringify(event)

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

      try {
        client.send(event_json)
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
 */
export const emit_active_session_started = (session) => {
  emit_session_event({
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
 */
export const emit_active_session_updated = (session) => {
  emit_session_event({
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
 */
export const emit_active_session_ended = (session_id) => {
  emit_session_event({
    event_type: 'ACTIVE_SESSION_ENDED',
    payload: { session_id }
  })
}
