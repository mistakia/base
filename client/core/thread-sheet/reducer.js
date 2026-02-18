import { Map, List } from 'immutable'

import { thread_sheet_action_types } from './actions'
import { threads_action_types } from '@core/threads/actions'

const initial_state = new Map({
  // Ordered list of open sheet thread_ids (last = topmost)
  sheets: List(),
  // Map of thread_id -> { thread_data, is_loading, error }
  sheet_data: Map()
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

export function thread_sheet_reducer(state = initial_state, { type, payload }) {
  switch (type) {
    case thread_sheet_action_types.OPEN_THREAD_SHEET: {
      const { thread_id } = payload
      const sheets = state.get('sheets')

      // If already open, move to top of stack
      const existing_index = sheets.indexOf(thread_id)
      if (existing_index >= 0) {
        return state.set(
          'sheets',
          sheets.delete(existing_index).push(thread_id)
        )
      }

      // Add new sheet to top of stack
      return state
        .update('sheets', (s) => s.push(thread_id))
        .setIn(
          ['sheet_data', thread_id],
          Map({
            thread_data: null,
            is_loading: false,
            error: null
          })
        )
    }

    case thread_sheet_action_types.CLOSE_THREAD_SHEET: {
      const { thread_id } = payload
      const sheets = state.get('sheets')
      const index = sheets.indexOf(thread_id)
      if (index < 0) return state

      return state
        .update('sheets', (s) => s.delete(index))
        .deleteIn(['sheet_data', thread_id])
    }

    case thread_sheet_action_types.CLOSE_TOP_THREAD_SHEET: {
      const sheets = state.get('sheets')
      if (sheets.size === 0) return state

      const top_thread_id = sheets.last()
      return state
        .update('sheets', (s) => s.pop())
        .deleteIn(['sheet_data', top_thread_id])
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

    default:
      return state
  }
}
