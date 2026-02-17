import { Map } from 'immutable'

import { thread_sheet_action_types } from './actions'
import { threads_action_types } from '@core/threads/actions'

const initial_state = new Map({
  is_open: false,
  thread_id: null,
  thread_data: null,
  is_loading: false,
  error: null
})

/**
 * Appends a timeline entry to the sheet's thread data if thread_id matches
 */
function append_sheet_timeline_entry(state, thread_id, entry) {
  const sheet_thread_id = state.get('thread_id')
  const thread_data = state.get('thread_data')

  if (!thread_data || sheet_thread_id !== thread_id) {
    return state
  }

  return state.update('thread_data', (data) =>
    data.update('timeline', (timeline) => {
      if (timeline && Array.isArray(timeline)) {
        const exists = timeline.some((e) => e.id === entry.id)
        if (exists) return timeline
        return [...timeline, entry]
      }
      return [entry]
    })
  )
}

export function thread_sheet_reducer(state = initial_state, { type, payload }) {
  switch (type) {
    case thread_sheet_action_types.OPEN_THREAD_SHEET:
      return state.merge({
        is_open: true,
        thread_id: payload.thread_id
      })

    case thread_sheet_action_types.CLOSE_THREAD_SHEET:
      return state.merge({
        is_open: false,
        thread_id: null,
        thread_data: null,
        error: null
      })

    case thread_sheet_action_types.GET_SHEET_THREAD_PENDING:
      return state.merge({
        is_loading: true,
        error: null
      })

    case thread_sheet_action_types.GET_SHEET_THREAD_FULFILLED:
      return state.merge({
        thread_data: Map(payload.data),
        is_loading: false,
        error: null
      })

    case thread_sheet_action_types.GET_SHEET_THREAD_FAILED:
      return state.merge({
        is_loading: false,
        error: payload.error
      })

    // Handle live WebSocket updates for the sheet's thread
    case threads_action_types.THREAD_UPDATED: {
      const updated_thread = Map(payload.thread)
      const thread_id = updated_thread.get('thread_id')
      const sheet_thread_id = state.get('thread_id')
      const thread_data = state.get('thread_data')

      if (!thread_data || sheet_thread_id !== thread_id) {
        return state
      }

      return state.update('thread_data', (current_data) =>
        current_data.merge(updated_thread)
      )
    }

    case threads_action_types.THREAD_TIMELINE_ENTRY_ADDED: {
      const { thread_id, entry } = payload
      if (!entry.truncated) {
        return append_sheet_timeline_entry(state, thread_id, entry)
      }
      return state
    }

    default:
      return state
  }
}
