import debug from 'debug'
import { WebSocket } from 'ws'

import wss from '#server/websocket.mjs'
import { check_thread_permission_for_user } from '#server/middleware/permission/index.mjs'
import { redact_session_data } from '#server/middleware/content-redactor.mjs'

const log = debug('active-sessions:events')
const log_lifecycle = debug('base:session-lifecycle')

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

      // Skip sessions without a locally-available thread (unless they have
      // a job_id indicating in-progress thread creation). These are from
      // other machines whose thread data hasn't synced yet.
      if (session && !thread_id && !session.job_id) {
        continue
      }

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

    const redacted_count = wss.clients.size - sent_count
    log_lifecycle(
      'EMIT event=%s session_id=%s thread_id=%s recipients=%d redacted=%d',
      event_type,
      session?.session_id || 'unknown',
      thread_id || 'none',
      sent_count,
      redacted_count
    )
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
 * Sent when a session ends (SessionEnd hook). Sessions with a thread
 * association route through the standard emitter for permission-based
 * filtering. All other cases (no thread_id, or session data unavailable)
 * broadcast session_id directly to all authenticated clients -- the
 * emit_session_event guard skips sessions without thread_id/job_id,
 * which would silently drop ENDED events for sessions that ended before
 * acquiring a thread.
 *
 * @param {string} session_id - ID of the ended session
 * @param {Object} [session] - Full session data read before removal
 * @returns {Promise<void>}
 */
export const emit_active_session_ended = async (session_id, session = null) => {
  // Sessions with thread association: use permission-based filtering
  if (session?.thread_id) {
    return await emit_session_event({
      event_type: 'ACTIVE_SESSION_ENDED',
      payload: { session_id, session }
    })
  }

  // No thread association or session data unavailable: broadcast to all
  // authenticated clients. The client only needs session_id for ENDED events.
  try {
    const event = {
      type: 'ACTIVE_SESSION_ENDED',
      payload: { session_id }
    }
    const event_json = JSON.stringify(event)

    let sent_count = 0
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN || !client.user_public_key) {
        continue
      }
      try {
        client.send(event_json)
        sent_count++
      } catch (send_error) {
        log(
          `Failed to send ACTIVE_SESSION_ENDED to client: ${send_error.message}`
        )
      }
    }
    log_lifecycle(
      'EMIT event=ACTIVE_SESSION_ENDED session_id=%s thread_id=none recipients=%d redacted=0',
      session_id,
      sent_count
    )
    log(
      `Emitted ACTIVE_SESSION_ENDED (broadcast, session_id=${session_id}) to ${sent_count} clients`
    )
  } catch (error) {
    log(`Failed to emit ACTIVE_SESSION_ENDED:`, error)
  }
}

/**
 * Emit THREAD_JOB_STARTED event
 *
 * Sent when a BullMQ thread job becomes active (worker picks it up).
 * Broadcast to all authenticated clients so they can update pending resume status.
 *
 * @param {Object} params
 * @param {string} params.job_id - BullMQ job ID
 * @param {string} params.thread_id - Thread being resumed
 * @returns {Promise<void>}
 */
export const emit_thread_job_started = async ({ job_id, thread_id }) => {
  try {
    const event = {
      type: 'THREAD_JOB_STARTED',
      payload: { job_id, thread_id }
    }
    const event_json = JSON.stringify(event)

    let sent_count = 0
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN || !client.user_public_key) {
        continue
      }
      try {
        client.send(event_json)
        sent_count++
      } catch (send_error) {
        log(
          `Failed to send THREAD_JOB_STARTED to client: ${send_error.message}`
        )
      }
    }
    log(
      `Emitted THREAD_JOB_STARTED (job_id=${job_id}, thread_id=${thread_id}) to ${sent_count} clients`
    )
  } catch (error) {
    log(`Failed to emit THREAD_JOB_STARTED:`, error)
  }
}

export const emit_thread_job_failed = async ({
  job_id,
  thread_id,
  error_message
}) => {
  try {
    const event = {
      type: 'THREAD_JOB_FAILED',
      payload: { job_id, thread_id, error_message }
    }
    const event_json = JSON.stringify(event)

    let sent_count = 0
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN || !client.user_public_key) {
        continue
      }
      try {
        client.send(event_json)
        sent_count++
      } catch (send_error) {
        log(`Failed to send THREAD_JOB_FAILED to client: ${send_error.message}`)
      }
    }
    log(
      `Emitted THREAD_JOB_FAILED (job_id=${job_id}, thread_id=${thread_id || 'none'}) to ${sent_count} clients`
    )
  } catch (error) {
    log(`Failed to emit THREAD_JOB_FAILED:`, error)
  }
}
