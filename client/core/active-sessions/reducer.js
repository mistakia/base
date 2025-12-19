import { Record, Map } from 'immutable'

import { active_sessions_action_types } from './actions'

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

    default:
      return state
  }
}
