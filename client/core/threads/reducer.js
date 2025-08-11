import { Record, List, Map } from 'immutable'

import { threads_action_types } from './actions'

const ThreadsState = new Record({
  threads: new List(),
  selected_thread: null,
  selected_thread_data: null,
  selected_thread_timeline: null,
  selected_thread_metadata: null,
  is_loading_threads: false,
  is_loading_thread: false,
  is_loading_timeline: false,
  is_loading_metadata: false,
  threads_error: null,
  thread_error: null,
  timeline_error: null,
  metadata_error: null
})

export function threads_reducer(state = new ThreadsState(), { payload, type }) {
  switch (type) {
    case threads_action_types.GET_THREADS_PENDING:
      return state.merge({
        is_loading_threads: true,
        threads_error: null
      })

    case threads_action_types.GET_THREADS_FULFILLED:
      return state.merge({
        threads: new List(payload.data || []),
        is_loading_threads: false,
        threads_error: null
      })

    case threads_action_types.GET_THREADS_FAILED:
      return state.merge({
        is_loading_threads: false,
        threads_error: payload.error
      })

    case threads_action_types.GET_THREAD_PENDING:
      return state.merge({
        is_loading_thread: true,
        thread_error: null
      })

    case threads_action_types.GET_THREAD_FULFILLED:
      return state.merge({
        selected_thread_data: Map(payload.data),
        is_loading_thread: false,
        thread_error: null
      })

    case threads_action_types.GET_THREAD_FAILED:
      return state.merge({
        is_loading_thread: false,
        thread_error: payload.error
      })

    case threads_action_types.SELECT_THREAD:
      return state.merge({
        selected_thread: payload.thread_id
      })

    case threads_action_types.GET_THREAD_TIMELINE_PENDING:
      return state.merge({
        is_loading_timeline: true,
        timeline_error: null
      })

    case threads_action_types.GET_THREAD_TIMELINE_FULFILLED: {
      const timeline_data = payload.data?.content
        ? JSON.parse(payload.data.content)
        : []
      return state.merge({
        selected_thread_timeline: Array.isArray(timeline_data)
          ? timeline_data
          : timeline_data.events || [],
        is_loading_timeline: false,
        timeline_error: null
      })
    }

    case threads_action_types.GET_THREAD_TIMELINE_FAILED:
      return state.merge({
        is_loading_timeline: false,
        timeline_error: payload.error
      })

    case threads_action_types.GET_THREAD_METADATA_PENDING:
      return state.merge({
        is_loading_metadata: true,
        metadata_error: null
      })

    case threads_action_types.GET_THREAD_METADATA_FULFILLED: {
      const metadata_data = payload.data?.content
        ? JSON.parse(payload.data.content)
        : null
      return state.merge({
        selected_thread_metadata: metadata_data,
        is_loading_metadata: false,
        metadata_error: null
      })
    }

    case threads_action_types.GET_THREAD_METADATA_FAILED:
      return state.merge({
        is_loading_metadata: false,
        metadata_error: payload.error
      })

    case threads_action_types.CLEAR_SELECTED_THREAD:
      return state.merge({
        selected_thread: null,
        selected_thread_data: null,
        selected_thread_timeline: null,
        selected_thread_metadata: null
      })

    default:
      return state
  }
}
