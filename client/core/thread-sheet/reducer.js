import { Map } from 'immutable'

import { thread_sheet_action_types } from './actions'
import { threads_action_types } from '@core/threads/actions'
import { active_sessions_action_types } from '@core/active-sessions/actions'

const initial_state = new Map({
  // Currently open sheet id (thread_id or "session:<id>"), or null
  active_sheet: null,
  // Map of "session:<id>" -> { session_id, session_status }
  sheet_data: Map()
})

/**
 * Transition a session sheet to a thread sheet by replacing the session key
 * with the thread_id.
 */
function transition_session_sheet_to_thread(state, session_id, thread_id) {
  const sheet_key = `session:${session_id}`
  if (state.get('active_sheet') !== sheet_key) return state

  return state
    .set('active_sheet', thread_id)
    .deleteIn(['sheet_data', sheet_key])
}

export function thread_sheet_reducer(state = initial_state, { type, payload }) {
  switch (type) {
    case thread_sheet_action_types.OPEN_THREAD_SHEET: {
      const { thread_id } = payload

      // If already the active sheet, no-op
      if (state.get('active_sheet') === thread_id) {
        return state
      }

      return initial_state.set('active_sheet', thread_id)
    }

    case thread_sheet_action_types.CLOSE_THREAD_SHEET: {
      const { thread_id } = payload
      if (state.get('active_sheet') !== thread_id) return state

      return initial_state
    }

    case thread_sheet_action_types.CLOSE_ALL_SHEETS: {
      return initial_state
    }

    // Session sheet support: open with session_id before thread exists
    case thread_sheet_action_types.OPEN_SESSION_SHEET: {
      const { session_id } = payload
      const sheet_key = `session:${session_id}`

      // If already the active sheet, no-op
      if (state.get('active_sheet') === sheet_key) {
        return state
      }

      return initial_state
        .set('active_sheet', sheet_key)
        .setIn(['sheet_data', sheet_key], Map({ session_id }))
    }

    // When a session gains a thread_id, transition any open session sheet
    case active_sessions_action_types.ACTIVE_SESSION_UPDATED: {
      const { session } = payload
      if (!session.thread_id || !session.session_id) return state
      return transition_session_sheet_to_thread(
        state,
        session.session_id,
        session.thread_id
      )
    }

    // When a thread is created matching a session sheet, transition it
    case threads_action_types.THREAD_CREATED: {
      const thread = payload.thread
      const source_session_id = thread?.external_session?.session_id
      if (!source_session_id) return state
      return transition_session_sheet_to_thread(
        state,
        source_session_id,
        thread.thread_id
      )
    }

    // Keep session sheet open when session ends, just update status
    case active_sessions_action_types.ACTIVE_SESSION_ENDED: {
      const { session_id } = payload
      const sheet_key = `session:${session_id}`
      if (!state.getIn(['sheet_data', sheet_key])) return state

      return state.setIn(['sheet_data', sheet_key, 'session_status'], 'ended')
    }

    default:
      return state
  }
}
