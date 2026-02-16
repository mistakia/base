import { Record, Map } from 'immutable'

import { active_sessions_action_types } from './actions'
import { threads_action_types } from '@core/threads/actions'

// ============================================================================
// Initial State
// ============================================================================

const ActiveSessionsState = new Record({
  // Map of session_id -> session data
  sessions: new Map(),
  // Map of job_id -> pending session data (tracks sessions before hooks fire)
  pending_sessions: new Map(),
  is_loading: false,
  error: null
})

// ============================================================================
// Reducer Function
// ============================================================================

export function active_sessions_reducer(
  state = new ActiveSessionsState(),
  { payload, type }
) {
  switch (type) {
    // ========================================================================
    // API Loading States
    // ========================================================================

    case active_sessions_action_types.GET_ACTIVE_SESSIONS_PENDING:
      return state.merge({
        is_loading: true,
        error: null
      })

    case active_sessions_action_types.GET_ACTIVE_SESSIONS_FULFILLED: {
      // Convert array to Map keyed by session_id
      const sessions_array = payload.data || []
      const sessions_map = new Map(
        sessions_array.map((session) => [session.session_id, Map(session)])
      )

      return state.merge({
        sessions: sessions_map,
        is_loading: false,
        error: null
      })
    }

    case active_sessions_action_types.GET_ACTIVE_SESSIONS_FAILED:
      return state.merge({
        is_loading: false,
        error: payload.error
      })

    // ========================================================================
    // WebSocket Real-Time Events
    // ========================================================================

    case active_sessions_action_types.ACTIVE_SESSION_STARTED: {
      const { session } = payload

      // If session has a job_id matching a pending session, merge and remove from pending
      if (session.job_id && state.hasIn(['pending_sessions', session.job_id])) {
        return state
          .setIn(['sessions', session.session_id], Map(session))
          .deleteIn(['pending_sessions', session.job_id])
      }

      return state.setIn(['sessions', session.session_id], Map(session))
    }

    case active_sessions_action_types.ACTIVE_SESSION_UPDATED: {
      const { session } = payload
      return state.setIn(['sessions', session.session_id], Map(session))
    }

    case active_sessions_action_types.ACTIVE_SESSION_ENDED: {
      const { session_id } = payload
      return state.deleteIn(['sessions', session_id])
    }

    // ========================================================================
    // Thread Timeline Events (from threads slice)
    // ========================================================================

    case threads_action_types.THREAD_TIMELINE_ENTRY_ADDED: {
      const { thread_id, entry } = payload

      // Skip system events (should not be shown as latest)
      if (entry.type === 'system') {
        return state
      }

      // Find session with matching thread_id and update its latest_timeline_event
      const sessions = state.get('sessions')
      const session_entry = sessions.findEntry(
        (session) => session.get('thread_id') === thread_id
      )

      if (session_entry) {
        const [session_id] = session_entry
        return state.setIn(
          ['sessions', session_id, 'latest_timeline_event'],
          entry
        )
      }

      return state
    }

    // ========================================================================
    // Pending Session Lifecycle (thread creation -> hook fires)
    // ========================================================================

    case threads_action_types.CREATE_THREAD_SESSION_PENDING: {
      const { opts } = payload
      const pending_id = `pending-${Date.now()}`
      const pending_session = Map({
        pending_id,
        status: 'queued',
        prompt_snippet: (opts.prompt || '').slice(0, 120),
        working_directory: opts.working_directory || null,
        created_at: new Date().toISOString()
      })

      // Store with pending_id as temp key; will be re-keyed on FULFILLED when job_id arrives
      return state.setIn(['pending_sessions', pending_id], pending_session)
    }

    case threads_action_types.CREATE_THREAD_SESSION_FULFILLED: {
      const { opts, data } = payload
      const job_id = data?.job_id

      if (!job_id) return state

      // Find the most recent pending session without a job_id (matching by prompt)
      const pending_entry = state
        .get('pending_sessions')
        .findEntry(
          (session) =>
            !session.get('job_id') &&
            session.get('prompt_snippet') ===
              (opts.prompt || '').slice(0, 120)
        )

      if (pending_entry) {
        const [old_key, pending_session] = pending_entry
        const updated_session = pending_session.merge({
          job_id,
          queue_position: data.queue_position,
          status: 'queued'
        })
        return state
          .deleteIn(['pending_sessions', old_key])
          .setIn(['pending_sessions', job_id], updated_session)
      }

      return state
    }

    case threads_action_types.CREATE_THREAD_SESSION_FAILED: {
      const { opts, error } = payload

      // Find matching pending session and mark as failed
      const pending_entry = state
        .get('pending_sessions')
        .findEntry(
          (session) =>
            session.get('prompt_snippet') ===
            (opts.prompt || '').slice(0, 120)
        )

      if (pending_entry) {
        const [key] = pending_entry
        return state.setIn(
          ['pending_sessions', key],
          state.getIn(['pending_sessions', key]).merge({
            status: 'failed',
            error_message: error
          })
        )
      }

      return state
    }

    case threads_action_types.THREAD_JOB_FAILED: {
      const { job_id, error_message } = payload

      if (job_id && state.hasIn(['pending_sessions', job_id])) {
        return state.setIn(
          ['pending_sessions', job_id],
          state.getIn(['pending_sessions', job_id]).merge({
            status: 'failed',
            error_message: error_message || 'Job failed'
          })
        )
      }

      return state
    }

    default:
      return state
  }
}
