import { Record, List, Map } from 'immutable'

import { threads_action_types } from './actions'
import { thread_columns } from '@views/components/ThreadsTable/index.js'
import { TABLE_OPERATORS } from 'react-table/src/constants.mjs'
import { create_default_table_state } from '@core/table/create-default-table-state.js'
import { create_view } from '@core/table/create-view.js'
import {
  update_view_on_config_change,
  on_table_pending,
  on_table_fulfilled,
  on_table_failed
} from '@core/table/table-reducer-helpers.js'

// ============================================================================
// Helper Functions for Reducer Logic
// ============================================================================

/**
 * Updates a thread in all table views
 */
function update_thread_in_all_views(state, thread_id, update_fn) {
  return state.update('thread_table_views', (views) =>
    views.map((view) =>
      view.updateIn(['thread_table_data'], (data) =>
        data
          ? data.map((thread) =>
              thread.get('thread_id') === thread_id ? update_fn(thread) : thread
            )
          : data
      )
    )
  )
}

/**
 * Adds a new thread to the beginning of all table views
 */
function add_thread_to_all_views(state, new_thread) {
  return state.update('thread_table_views', (views) =>
    views.map((view) =>
      view.updateIn(['thread_table_data'], (data) =>
        data ? data.unshift(new_thread) : List([new_thread])
      )
    )
  )
}

/**
 * Updates selected thread data if it matches the given thread_id
 */
function update_selected_thread_if_matches(state, thread_id, update_fn) {
  const current_selected_id = state.getIn(['selected_thread_data', 'thread_id'])

  if (state.get('selected_thread_data') && current_selected_id === thread_id) {
    return state.update('selected_thread_data', update_fn)
  }

  return state
}

/**
 * Updates a thread in the basic threads list
 */
function update_thread_in_basic_list(state, thread_id, updated_data) {
  return state.update('threads', (threads) => {
    if (!threads) return threads
    return threads.map((thread) => {
      const id = thread.thread_id || thread.get?.('thread_id')
      if (id === thread_id) {
        // Merge updated data into the thread
        if (thread.merge) {
          return thread.merge(updated_data)
        }
        return { ...thread, ...updated_data }
      }
      return thread
    })
  })
}

/**
 * Appends a timeline entry to the selected thread
 */
function append_timeline_entry(state, thread_id, entry) {
  return update_selected_thread_if_matches(state, thread_id, (thread_data) =>
    thread_data.update('timeline', (timeline) => {
      // Timeline is a plain JS array from Map(payload.data), not an Immutable List
      if (timeline && Array.isArray(timeline)) {
        // Check if entry already exists by id to prevent duplicates
        // This can happen when websocket events arrive after get_thread already updated the data
        const exists = timeline.some((e) => e.id === entry.id)
        if (exists) {
          return timeline
        }
        return [...timeline, entry]
      }
      return [entry]
    })
  )
}

// ============================================================================
// Default Table Configuration
// ============================================================================

const DEFAULT_TABLE_COLUMNS = [
  'thread_state',
  'source_provider',
  'title',
  'working_directory',
  'created_at',
  'updated_at',
  'duration',
  'message_count',
  'user_message_count',
  'assistant_message_count',
  'tool_call_count',
  'total_tokens',
  'cost'
]

const DEFAULT_TABLE_STATE = create_default_table_state({
  columns: DEFAULT_TABLE_COLUMNS,
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
    columns: DEFAULT_TABLE_COLUMNS,
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

// Note: time-based filter dates are computed at module load time.
// For long-running sessions, these become stale. A proper fix requires
// recalculating in a selector or action when the view is selected.
const LAST_48_HOURS_VIEW = create_view({
  entity_prefix: 'thread',
  view_id: 'last_48_hours',
  view_name: 'Last 48 Hours',
  table_state: create_default_table_state({
    columns: DEFAULT_TABLE_COLUMNS,
    sort: [{ column_id: 'created_at', desc: true }],
    where: new List([
      {
        column_id: 'created_at',
        operator: TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
        value: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      }
    ])
  })
})

const LAST_7_DAYS_VIEW = create_view({
  entity_prefix: 'thread',
  view_id: 'last_7_days',
  view_name: 'Last 7 Days',
  table_state: create_default_table_state({
    columns: DEFAULT_TABLE_COLUMNS,
    sort: [{ column_id: 'created_at', desc: true }],
    where: new List([
      {
        column_id: 'created_at',
        operator: TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
        value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    ])
  })
})

// ============================================================================
// Initial State
// ============================================================================

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
    active: ACTIVE_THREADS_VIEW,
    last_48_hours: LAST_48_HOURS_VIEW,
    last_7_days: LAST_7_DAYS_VIEW
  }),
  selected_thread_table_view_id: 'active',
  thread_all_columns: Map(thread_columns)
})

// ============================================================================
// Reducer Function
// ============================================================================

export function threads_reducer(state = new ThreadsState(), { payload, type }) {
  switch (type) {
    // ========================================================================
    // Basic Threads List Actions
    // ========================================================================

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

    // ========================================================================
    // Single Thread Actions
    // ========================================================================

    case threads_action_types.GET_THREAD_PENDING:
      return state.merge({
        is_loading_thread: true,
        thread_error: null
      })

    case threads_action_types.GET_THREAD_FULFILLED: {
      const thread_data = payload.data
      const thread_id = thread_data?.thread_id
      let new_state = state.merge({
        selected_thread_data: Map(thread_data),
        is_loading_thread: false,
        thread_error: null
      })
      // Also update the thread in the basic threads list if it exists
      if (thread_id) {
        new_state = update_thread_in_basic_list(
          new_state,
          thread_id,
          thread_data
        )
      }
      return new_state
    }

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

    // ========================================================================
    // Models Data Actions
    // ========================================================================

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

    // ========================================================================
    // Table View Management Actions
    // ========================================================================

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

    // ========================================================================
    // WebSocket Real-Time Thread Events
    // ========================================================================

    case threads_action_types.THREAD_CREATED: {
      const new_thread = Map(payload.thread)
      return add_thread_to_all_views(state, new_thread)
    }

    case threads_action_types.THREAD_UPDATED: {
      const updated_thread = Map(payload.thread)
      const thread_id = updated_thread.get('thread_id')

      // Update thread in all table views
      let new_state = update_thread_in_all_views(
        state,
        thread_id,
        () => updated_thread
      )

      // Update selected thread if it matches - MERGE instead of replace to preserve timeline
      new_state = update_selected_thread_if_matches(
        new_state,
        thread_id,
        (current_data) =>
          current_data ? current_data.merge(updated_thread) : updated_thread
      )

      // Also update the basic threads list
      new_state = update_thread_in_basic_list(
        new_state,
        thread_id,
        payload.thread
      )

      return new_state
    }

    case threads_action_types.THREAD_TIMELINE_ENTRY_ADDED: {
      const { thread_id, entry } = payload

      // Only append full (non-truncated) entries to the selected thread timeline.
      // Truncated entries are received when the client is not subscribed to the
      // thread and contain only summary fields for session card display.
      let new_state = state
      if (!entry.truncated) {
        new_state = append_timeline_entry(state, thread_id, entry)
      }

      // Update the basic threads list with the latest_timeline_event
      // (works for both full and truncated entries since session cards
      // only need summary-level fields)
      // Skip if entry is a system event (should not be shown as latest)
      if (entry.type !== 'system') {
        new_state = update_thread_in_basic_list(new_state, thread_id, {
          latest_timeline_event: entry
        })
      }

      return new_state
    }

    case threads_action_types.THREAD_JOB_FAILED: {
      const { thread_id, error } = payload
      const job_info = Map({ status: 'failed', error })

      return update_thread_in_all_views(state, thread_id, (thread) =>
        thread.merge({ job_info, thread_state: 'failed' })
      )
    }

    default:
      return state
  }
}
