import { Record, Map } from 'immutable'

import { active_sessions_action_types } from './actions'
import { threads_action_types } from '@core/threads/actions'
import { log_lifecycle } from '@core/utils/session-lifecycle-debug'

// ============================================================================
// Initial State
// ============================================================================

const ActiveSessionsState = new Record({
  // Thin ephemeral data store keyed by session_id
  // Each entry: { thread_id, latest_timeline_event, context_percentage, last_activity_at }
  session_data: new Map(),
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
      const sessions_array = payload.data || []
      const session_data = new Map(
        sessions_array.map((session) => [
          session.session_id,
          Map({
            thread_id: session.thread_id || null,
            latest_timeline_event: session.latest_timeline_event || null,
            context_percentage: session.context_percentage || null,
            last_activity_at: session.updated_at || session.started_at || null
          })
        ])
      )
      return state.merge({
        session_data,
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
      log_lifecycle('ACTIVE_SESSION_STARTED', {
        session_id: session.session_id,
        thread_id: session.thread_id
      })
      return state.setIn(
        ['session_data', session.session_id],
        Map({
          thread_id: session.thread_id || null,
          latest_timeline_event: session.latest_timeline_event || null,
          context_percentage: session.context_percentage || null,
          last_activity_at: new Date().toISOString()
        })
      )
    }

    case active_sessions_action_types.ACTIVE_SESSION_UPDATED: {
      const { session } = payload
      log_lifecycle('ACTIVE_SESSION_UPDATED', {
        session_id: session.session_id,
        thread_id: session.thread_id
      })

      const existing = state.getIn(['session_data', session.session_id])
      if (existing) {
        // Merge only ephemeral fields
        let updated = existing
        if (session.thread_id) {
          updated = updated.set('thread_id', session.thread_id)
        }
        if (session.latest_timeline_event) {
          updated = updated.set(
            'latest_timeline_event',
            session.latest_timeline_event
          )
        }
        if (session.context_percentage !== undefined) {
          updated = updated.set('context_percentage', session.context_percentage)
        }
        updated = updated.set('last_activity_at', new Date().toISOString())
        return state.setIn(['session_data', session.session_id], updated)
      }

      // Upsert for missed STARTED
      return state.setIn(
        ['session_data', session.session_id],
        Map({
          thread_id: session.thread_id || null,
          latest_timeline_event: session.latest_timeline_event || null,
          context_percentage: session.context_percentage || null,
          last_activity_at: new Date().toISOString()
        })
      )
    }

    case active_sessions_action_types.ACTIVE_SESSION_ENDED: {
      const { session_id } = payload
      log_lifecycle('ACTIVE_SESSION_ENDED', { session_id })
      return state.deleteIn(['session_data', session_id])
    }

    // ========================================================================
    // Thread Timeline Events
    // ========================================================================

    case threads_action_types.THREAD_TIMELINE_ENTRY_ADDED: {
      const { thread_id, entry } = payload

      if (entry.type === 'system') {
        return state
      }

      // Find session by thread_id and update latest_timeline_event
      const session_entry = state
        .get('session_data')
        .findEntry((data) => data.get('thread_id') === thread_id)

      if (session_entry) {
        const [session_id] = session_entry
        return state.setIn(
          ['session_data', session_id, 'latest_timeline_event'],
          entry
        )
      }

      return state
    }

    default:
      return state
  }
}
