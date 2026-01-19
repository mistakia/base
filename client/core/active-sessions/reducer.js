import { Record, Map } from 'immutable'

import { active_sessions_action_types } from './actions'
import { threads_action_types } from '@core/threads/actions'

// ============================================================================
// Initial State
// ============================================================================

const ActiveSessionsState = new Record({
  // Map of session_id -> session data
  sessions: new Map(),
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

    default:
      return state
  }
}
