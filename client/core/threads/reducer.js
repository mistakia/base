import { Record, List, Map } from 'immutable'

import { threads_action_types } from './actions'
import { thread_columns } from '@views/components/ThreadsTable/index.js'
import { create_default_table_state } from '@core/table/create-default-table-state.js'
import { create_view } from '@core/table/create-view.js'
import {
  update_view_on_config_change,
  on_table_pending,
  on_table_fulfilled,
  on_table_failed
} from '@core/table/table-reducer-helpers.js'

const DEFAULT_TABLE_STATE = create_default_table_state({
  columns: [
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
  ],
  sort: [{ column_id: 'updated_at', desc: true }]
})

const DEFAULT_THREAD_TABLE_VIEW = create_view({
  entity_prefix: 'thread',
  view_id: 'default',
  view_name: 'All Threads',
  table_state: DEFAULT_TABLE_STATE
})

const ACTIVE_THREADS_VIEW = create_view({
  entity_prefix: 'thread',
  view_id: 'active',
  view_name: 'Active Threads',
  table_state: create_default_table_state({
    columns: [
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
    ],
    sort: [{ column_id: 'updated_at', desc: true }],
    where: new List([
      {
        column_id: 'thread_state',
        operator: '=',
        value: 'active'
      }
    ])
  })
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
      return state.updateIn(['thread_table_views', view_id], (existing_view) =>
        update_view_on_config_change({
          view: existing_view,
          entity_prefix: 'thread',
          view_id,
          view_name: view?.view_name,
          table_state: view?.table_state
        })
      )
    }

    case threads_action_types.SELECT_THREAD_TABLE_VIEW:
      return state.set('selected_thread_table_view_id', payload.view_id)

    case threads_action_types.GET_THREADS_TABLE_PENDING: {
      const view_id_pending = payload.view_id || 'default'
      return state.updateIn(['thread_table_views', view_id_pending], (view) =>
        on_table_pending({
          view,
          entity_prefix: 'thread',
          is_append: payload.opts?.is_append
        })
      )
    }

    case threads_action_types.GET_THREADS_TABLE_FULFILLED: {
      const is_append = payload.opts?.is_append || false
      const view_id_fulfilled = payload.opts?.view_id || 'default'
      const rows = Array.isArray(payload.data?.rows) ? payload.data.rows : []
      const thread_total_row_count =
        typeof payload.data?.total_row_count === 'number'
          ? payload.data.total_row_count
          : 0

      return state.updateIn(['thread_table_views', view_id_fulfilled], (view) =>
        on_table_fulfilled({
          view,
          entity_prefix: 'thread',
          rows,
          is_append,
          total_row_count: thread_total_row_count
        })
      )
    }

    case threads_action_types.GET_THREADS_TABLE_FAILED: {
      const view_id_failed = payload.view_id || 'default'
      return state.updateIn(['thread_table_views', view_id_failed], (view) =>
        on_table_failed({
          view,
          entity_prefix: 'thread',
          error: payload.error
        })
      )
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
