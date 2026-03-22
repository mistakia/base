import { Map } from 'immutable'

import { thread_sheet_action_types } from './actions'
import { threads_action_types } from '@core/threads/actions'
import { active_sessions_action_types } from '@core/active-sessions/actions'

const initial_state = new Map({
  // Currently open sheet id (thread_id or "session:<id>"), or null
  active_sheet: null,
  // Map of thread_id -> { thread_data, is_loading, error }
  sheet_data: Map()
})

const empty_sheet_data = Map({
  thread_data: null,
  is_loading: false,
  error: null
})

/**
 * Appends a timeline entry to a sheet's thread data if thread_id matches an open sheet
 */
function append_sheet_timeline_entry(state, thread_id, entry) {
  const data = state.getIn(['sheet_data', thread_id])
  if (!data || !data.get('thread_data')) {
    return state
  }

  return state.updateIn(
    ['sheet_data', thread_id, 'thread_data'],
    (thread_data) =>
      thread_data.update('timeline', (timeline) => {
        if (timeline && Array.isArray(timeline)) {
          const exists = timeline.some((e) => e.id === entry.id)
          if (exists) return timeline
          return [...timeline, entry]
        }
        return [entry]
      })
  )
}

/**
 * Transition a session sheet to a thread sheet by replacing the session key
 * with the thread_id and resetting sheet_data.
 */
function transition_session_sheet_to_thread(state, session_id, thread_id) {
  const sheet_key = `session:${session_id}`
  if (state.get('active_sheet') !== sheet_key) return state

  return state
    .set('active_sheet', thread_id)
    .deleteIn(['sheet_data', sheet_key])
    .setIn(['sheet_data', thread_id], empty_sheet_data)
}

export function thread_sheet_reducer(state = initial_state, { type, payload }) {
  switch (type) {
    case thread_sheet_action_types.OPEN_THREAD_SHEET: {
      const { thread_id } = payload

      // If already the active sheet, no-op
      if (state.get('active_sheet') === thread_id) {
        return state
      }

      // Preserve existing sheet_data for this thread if it exists (avoids
      // discarding in-flight API responses on rapid re-open)
      const existing_data = state.getIn(['sheet_data', thread_id])
      return initial_state
        .set('active_sheet', thread_id)
        .setIn(['sheet_data', thread_id], existing_data || empty_sheet_data)
    }

    case thread_sheet_action_types.CLOSE_THREAD_SHEET: {
      const { thread_id } = payload
      if (state.get('active_sheet') !== thread_id) return state

      return initial_state
    }

    case thread_sheet_action_types.CLOSE_ALL_SHEETS: {
      return initial_state
    }

    case thread_sheet_action_types.GET_SHEET_THREAD_PENDING: {
      const thread_id = payload.opts?.thread_id
      if (!thread_id || !state.getIn(['sheet_data', thread_id])) return state
      return state.mergeIn(['sheet_data', thread_id], {
        is_loading: true,
        error: null
      })
    }

    case thread_sheet_action_types.GET_SHEET_THREAD_FULFILLED: {
      const thread_id = payload.opts?.thread_id
      if (!thread_id || !state.getIn(['sheet_data', thread_id])) return state
      return state.mergeIn(['sheet_data', thread_id], {
        thread_data: Map(payload.data),
        is_loading: false,
        error: null
      })
    }

    case thread_sheet_action_types.GET_SHEET_THREAD_FAILED: {
      const thread_id = payload.opts?.thread_id
      if (!thread_id || !state.getIn(['sheet_data', thread_id])) return state
      return state.mergeIn(['sheet_data', thread_id], {
        is_loading: false,
        error: payload.error
      })
    }

    // Handle live WebSocket updates for any open sheet's thread
    case threads_action_types.THREAD_UPDATED: {
      const updated_thread = Map(payload.thread)
      const thread_id = updated_thread.get('thread_id')

      if (!state.getIn(['sheet_data', thread_id, 'thread_data'])) {
        return state
      }

      return state.updateIn(
        ['sheet_data', thread_id, 'thread_data'],
        (current_data) => current_data.merge(updated_thread)
      )
    }

    case threads_action_types.THREAD_TIMELINE_ENTRY_ADDED: {
      const { thread_id, entry } = payload
      if (!entry.truncated) {
        return append_sheet_timeline_entry(state, thread_id, entry)
      }
      return state
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
        .setIn(
          ['sheet_data', sheet_key],
          empty_sheet_data.set('session_id', session_id)
        )
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
      const source_session_id = thread?.source?.session_id
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
