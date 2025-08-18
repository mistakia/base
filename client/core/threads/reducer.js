import { Record, List, Map } from 'immutable'

import { threads_action_types } from './actions'
import { thread_columns } from '@views/components/ThreadsTable/index.js'

const DEFAULT_TABLE_STATE = new Map({
  columns: new List([
    'thread_state',
    'session_provider',
    'working_directory',
    'updated_at',
    'duration',
    'message_count',
    'user_message_count',
    'assistant_message_count',
    'tool_call_count',
    'token_count',
    'cost'
  ]),
  sort: new List([{ column_id: 'updated_at', direction: 'desc' }]),
  where: new List(),
  splits: new List(),
  limit: 1000,
  offset: 0
})

const ThreadsState = new Record({
  // Basic threads list for simple get_threads API calls
  threads: new List(),
  selected_thread: null,
  selected_thread_data: null,
  is_loading_threads: false,
  is_loading_thread: false,
  threads_error: null,
  thread_error: null,

  // Table-specific threads data for get_threads_table API calls
  table_threads: new List(),
  table_selected_thread: null,
  table_selected_thread_data: null,

  models_data: new Map({
    loading: false,
    error: null,
    data: null
  }),
  // Table state management with defaults
  table_state: DEFAULT_TABLE_STATE,
  all_columns: Map(thread_columns),
  // Pagination state
  total_row_count: 0,
  total_rows_fetched: 0,
  // Table loading states
  is_fetching: false,
  is_fetching_more: false,
  table_error: null
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

    case threads_action_types.CLEAR_SELECTED_THREAD:
      return state.merge({
        selected_thread: null,
        selected_thread_data: null
      })

    case threads_action_types.GET_MODELS_PENDING:
      return state.mergeIn(['models_data'], {
        loading: true,
        error: null
      })

    case threads_action_types.GET_MODELS_FULFILLED:
      return state.mergeIn(['models_data'], {
        loading: false,
        error: null,
        data: Map(payload.data.models || {})
      })

    case threads_action_types.GET_MODELS_FAILED:
      return state.mergeIn(['models_data'], {
        loading: false,
        error: payload.error
      })

    // Table state management actions
    case threads_action_types.UPDATE_THREADS_TABLE_STATE:
      return state.merge({
        table_state: payload.table_state,
        table_threads: new List()
      })

    case threads_action_types.GET_THREADS_TABLE_PENDING:
      return state.merge({
        is_fetching: !payload.opts?.is_append,
        is_fetching_more: payload.opts?.is_append || false,
        table_error: null
      })

    case threads_action_types.GET_THREADS_TABLE_FULFILLED: {
      const is_append = payload.opts?.is_append || false
      // Convert thread objects to plain JS objects for ImmutableJS compatibility
      const thread_data = payload.data?.data || []
      const threads_list = Array.isArray(thread_data) ? thread_data : []

      return state.merge({
        table_threads: is_append
          ? state.get('table_threads').concat(List(threads_list))
          : List(threads_list),
        total_row_count: payload.total_count || 0,
        total_rows_fetched: is_append
          ? state.get('total_rows_fetched') + threads_list.length
          : threads_list.length,
        is_fetching: false,
        is_fetching_more: false,
        table_error: null
      })
    }

    case threads_action_types.GET_THREADS_TABLE_FAILED:
      return state.merge({
        is_fetching: false,
        is_fetching_more: false,
        table_error: payload.error
      })

    case threads_action_types.RESET_THREADS_TABLE_STATE:
      return state.merge({
        table_state: DEFAULT_TABLE_STATE,
        table_threads: new List(),
        total_row_count: 0,
        total_rows_fetched: 0,
        is_fetching: false,
        is_fetching_more: false,
        table_error: null
      })

    default:
      return state
  }
}
