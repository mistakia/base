import { send } from '#server/websocket.mjs'
import debug from 'debug'

const log = debug('threads:events')

/**
 * Central utility for emitting thread-related WebSocket events
 *
 * Events are sent to the thread owner (via user_public_key) and auto-dispatched
 * to Redux on the client side. Permission filtering is currently skipped.
 */

// ============================================================================
// Core Event Emitter
// ============================================================================

/**
 * Emit a thread event via WebSocket
 *
 * @param {Object} params - Event parameters
 * @param {string} params.user_public_key - Thread owner (used for routing)
 * @param {string} params.event_type - Redux action type (e.g., 'THREAD_CREATED')
 * @param {Object} params.payload - Event payload data
 */
const emit_thread_event = ({ user_public_key, event_type, payload }) => {
  try {
    if (!user_public_key) {
      log(`⚠ Cannot emit ${event_type} - no user_public_key provided`)
      return
    }

    const event = { type: event_type, payload }
    send({ user_public_key, event })
    log(`✓ ${event_type} → ${user_public_key}`)
  } catch (error) {
    log(`✗ Failed to emit ${event_type}:`, error)
    // Don't throw - WebSocket failures shouldn't block operations
  }
}

// ============================================================================
// Thread Lifecycle Events
// ============================================================================

/**
 * Emit THREAD_CREATED event
 * @param {Object} thread - Thread object with metadata
 */
export const emit_thread_created = (thread) => {
  emit_thread_event({
    user_public_key: thread.user_public_key,
    event_type: 'THREAD_CREATED',
    payload: { thread }
  })
}

/**
 * Emit THREAD_UPDATED event
 * @param {Object} thread - Updated thread object
 */
export const emit_thread_updated = (thread) => {
  emit_thread_event({
    user_public_key: thread.user_public_key,
    event_type: 'THREAD_UPDATED',
    payload: { thread }
  })
}

/**
 * Emit THREAD_TIMELINE_ENTRY_ADDED event
 * @param {Object} params
 * @param {string} params.thread_id - Thread UUID
 * @param {Object} params.entry - Timeline entry object
 * @param {string} params.user_public_key - Thread owner
 */
export const emit_thread_timeline_entry_added = ({
  thread_id,
  entry,
  user_public_key
}) => {
  emit_thread_event({
    user_public_key,
    event_type: 'THREAD_TIMELINE_ENTRY_ADDED',
    payload: { thread_id, entry, user_public_key }
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
