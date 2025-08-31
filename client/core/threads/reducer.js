import { Record, List, Map } from 'immutable'

import { threads_action_types } from './actions'
import { thread_columns } from '@views/components/ThreadsTable/index.js'

const DEFAULT_TABLE_STATE = new Map({
  columns: new List([
    'thread_state',
    'session_provider',
    'title',
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
  sort: new List([{ column_id: 'updated_at', desc: true }]),
  where: new List(),
  splits: new List(),
  limit: 1000,
  offset: 0
})

const DEFAULT_THREAD_TABLE_VIEW = new Map({
  thread_view_id: 'default',
  thread_view_name: 'All Threads',
  thread_table_state: DEFAULT_TABLE_STATE,
  saved_table_state: DEFAULT_TABLE_STATE,
  // Table-specific data for this view
  thread_table_results: new List(),
  thread_table_selected_thread: null,
  thread_table_selected_thread_data: null,
  thread_total_row_count: 0,
  thread_total_rows_fetched: 0,
  thread_is_fetching: false,
  thread_is_fetching_more: false,
  thread_table_error: null
})

const ACTIVE_THREADS_VIEW = new Map({
  thread_view_id: 'active',
  thread_view_name: 'Active Threads',
  thread_table_state: DEFAULT_TABLE_STATE.setIn(
    ['where'],
    new List([
      {
        column_id: 'thread_state',
        operator: '=',
        value: 'active'
      }
    ])
  ),
  saved_table_state: DEFAULT_TABLE_STATE.setIn(
    ['where'],
    new List([
      {
        column_id: 'thread_state',
        operator: '=',
        value: 'active'
      }
    ])
  ),
  // Table-specific data for this view
  thread_table_results: new List(),
  thread_table_selected_thread: null,
  thread_table_selected_thread_data: null,
  thread_total_row_count: 0,
  thread_total_rows_fetched: 0,
  thread_is_fetching: false,
  thread_is_fetching_more: false,
  thread_table_error: null
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

  models_data: new Map({
    loading: false,
    error: null,
    data: null
  }),

  // Table views management
  thread_table_views: new Map({
    default: DEFAULT_THREAD_TABLE_VIEW,
    active: ACTIVE_THREADS_VIEW
  }),
  selected_thread_table_view_id: 'default',
  thread_all_columns: Map(thread_columns)
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

    // Table view management actions
    case threads_action_types.UPDATE_THREAD_TABLE_VIEW: {
      const { view } = payload
      const view_id = view?.view_id || 'default'
      return state.updateIn(
        ['thread_table_views', view_id],
        (existing_view) => {
          const updates = {
            thread_view_id: view_id,
            thread_view_name:
              view?.view_name || existing_view.get('thread_view_name'),
            thread_table_state: new Map(view?.table_state || {}),
            thread_table_results: new List() // Clear threads when table state changes
          }

          // Set saved_table_state on first load if it doesn't exist
          if (!existing_view.has('saved_table_state') && view?.table_state) {
            updates.saved_table_state = new Map(view.table_state)
          }

          return existing_view.merge(updates)
        }
      )
    }

    case threads_action_types.SELECT_THREAD_TABLE_VIEW:
      return state.set('selected_thread_table_view_id', payload.view_id)

    case threads_action_types.GET_THREADS_TABLE_PENDING: {
      const view_id_pending = payload.view_id || 'default'
      return state.updateIn(['thread_table_views', view_id_pending], (view) => {
        return view.merge({
          thread_is_fetching: !payload.opts?.is_append,
          thread_is_fetching_more: payload.opts?.is_append || false,
          thread_table_error: null
        })
      })
    }

    case threads_action_types.GET_THREADS_TABLE_FULFILLED: {
      const is_append = payload.opts?.is_append || false
      const view_id_fulfilled = payload.opts?.view_id || 'default'
      const rows = Array.isArray(payload.data?.rows) ? payload.data.rows : []
      const thread_total_row_count =
        typeof payload.data?.total_row_count === 'number'
          ? payload.data.total_row_count
          : 0

      return state.updateIn(
        ['thread_table_views', view_id_fulfilled],
        (view) => {
          return view.merge({
            thread_table_results: is_append
              ? view.get('thread_table_results').concat(List(rows))
              : List(rows),
            thread_total_row_count,
            thread_total_rows_fetched: is_append
              ? view.get('thread_total_rows_fetched') + rows.length
              : rows.length,
            thread_is_fetching: false,
            thread_is_fetching_more: false,
            thread_table_error: null
          })
        }
      )
    }

    case threads_action_types.GET_THREADS_TABLE_FAILED: {
      const view_id_failed = payload.view_id || 'default'
      return state.updateIn(['thread_table_views', view_id_failed], (view) => {
        return view.merge({
          thread_is_fetching: false,
          thread_is_fetching_more: false,
          thread_table_error: payload.error
        })
      })
    }

    case threads_action_types.RESET_THREAD_TABLE_VIEW: {
      const reset_view_id = payload.view_id || 'default'
      return state.setIn(
        ['thread_table_views', reset_view_id],
        DEFAULT_THREAD_TABLE_VIEW
      )
    }

    default:
      return state
  }
}
