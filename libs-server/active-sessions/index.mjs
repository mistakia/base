/**
 * Active Sessions Module
 *
 * Tracks actively running Claude Code sessions with:
 * - Redis-backed store for session state
 * - Thread matching to associate sessions with existing threads
 * - WebSocket events for real-time UI updates
 */

// Store operations
export {
  register_active_session,
  update_active_session,
  get_active_session,
  get_all_active_sessions,
  remove_active_session,
  get_and_remove_active_session,
  get_active_session_for_thread,
  close_session_store
} from './active-session-store.mjs'

// Thread matching
export {
  find_thread_for_session,
  find_all_threads_for_session
} from './session-thread-matcher.mjs'

// WebSocket events
export {
  emit_active_session_started,
  emit_active_session_updated,
  emit_active_session_ended,
  emit_thread_job_failed,
  emit_thread_job_started
} from './session-event-emitter.mjs'
