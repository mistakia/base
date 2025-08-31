import { Record, List, Map } from 'immutable'

import { tasks_action_types } from './actions'
import { task_columns } from '@views/components/TasksTable/index.js'
import { TABLE_OPERATORS } from 'react-table/src/constants.mjs'
import { TASK_STATUS } from '@libs-shared/task-constants.mjs'

// Default view configuration factory
const create_default_view = ({
  view_id,
  view_name,
  where_clause = new List()
}) => {
  const default_table_state = new Map({
    columns: new List([
      'title',
      'status',
      'priority',
      'finish_by',
      'assigned_to',
      'created_at',
      'updated_at'
    ]),
    sort: new List([{ column_id: 'created_at', desc: true }]),
    where: where_clause,
    splits: new List(),
    limit: 1000,
    offset: 0
  })

  return new Map({
    task_view_id: view_id,
    task_view_name: view_name,
    task_table_state: default_table_state,
    saved_table_state: default_table_state,
    // Table-specific data for this view
    task_table_results: new List(),
    task_total_row_count: 0,
    task_total_rows_fetched: 0,
    task_is_fetching: false,
    task_is_fetching_more: false,
    task_table_error: null
  })
}

// Default views
const DEFAULT_VIEWS = {
  default: create_default_view({ view_id: 'default', view_name: 'All Tasks' }),
  active: create_default_view({
    view_id: 'active',
    view_name: 'Active Tasks',
    where_clause: new List([
      new Map({
        column_id: 'status',
        operator: TABLE_OPERATORS.IN,
        value: [TASK_STATUS.STARTED, TASK_STATUS.IN_PROGRESS]
      })
    ])
  }),
  upcoming: create_default_view({
    view_id: 'upcoming',
    view_name: 'Upcoming Tasks',
    where_clause: new List([
      new Map({
        column_id: 'status',
        operator: TABLE_OPERATORS.IN,
        value: [TASK_STATUS.PLANNED]
      })
    ])
  })
}

const TasksState = new Record({
  // Basic tasks list for simple get_tasks API calls
  tasks: new List(),
  is_loading_tasks: false,
  tasks_error: null,

  // Table views management
  task_table_views: new Map(DEFAULT_VIEWS),
  selected_task_table_view_id: 'default',
  task_all_columns: Map(task_columns)
})

export function tasks_reducer(state = new TasksState(), { payload, type }) {
  switch (type) {
    case tasks_action_types.GET_TASKS_PENDING:
      return state.merge({
        is_loading_tasks: true,
        tasks_error: null
      })

    case tasks_action_types.GET_TASKS_FULFILLED:
      return state.merge({
        tasks: new List(payload.data || []),
        is_loading_tasks: false,
        tasks_error: null
      })

    case tasks_action_types.GET_TASKS_FAILED:
      return state.merge({
        is_loading_tasks: false,
        tasks_error: payload.error
      })

    // Table view management actions
    case tasks_action_types.UPDATE_TASK_TABLE_VIEW: {
      const { view } = payload
      const view_id = view?.view_id || 'default'
      return state.updateIn(['task_table_views', view_id], (existing_view) => {
        const updates = {
          task_view_id: view_id,
          task_view_name:
            view?.view_name || existing_view.get('task_view_name'),
          task_table_state: new Map(view?.table_state || {}),
          task_table_results: new List() // Clear tasks when table state changes
        }

        // Set saved_table_state on first load if it doesn't exist
        if (!existing_view.has('saved_table_state') && view?.table_state) {
          updates.saved_table_state = new Map(view.table_state)
        }

        return existing_view.merge(updates)
      })
    }

    case tasks_action_types.SELECT_TASK_TABLE_VIEW:
      return state.set('selected_task_table_view_id', payload.view_id)

    case tasks_action_types.GET_TASKS_TABLE_PENDING: {
      const view_id_pending = payload.view_id || 'default'
      return state.updateIn(['task_table_views', view_id_pending], (view) => {
        return view.merge({
          task_is_fetching: !payload.opts?.is_append,
          task_is_fetching_more: payload.opts?.is_append || false,
          task_table_error: null
        })
      })
    }

    case tasks_action_types.GET_TASKS_TABLE_FULFILLED: {
      const is_append = payload.opts?.is_append || false
      const view_id_fulfilled = payload.opts?.view_id || 'default'
      // Convert task objects to plain JS objects for ImmutableJS compatibility
      const task_data = payload.data?.rows || []
      const tasks_list = Array.isArray(task_data) ? task_data : []

      return state.updateIn(['task_table_views', view_id_fulfilled], (view) => {
        return view.merge({
          task_table_results: is_append
            ? view.get('task_table_results').concat(List(tasks_list))
            : List(tasks_list),
          task_total_row_count: payload.data?.total_row_count || 0,
          task_total_rows_fetched: is_append
            ? view.get('task_total_rows_fetched') + tasks_list.length
            : tasks_list.length,
          task_is_fetching: false,
          task_is_fetching_more: false,
          task_table_error: null
        })
      })
    }

    case tasks_action_types.GET_TASKS_TABLE_FAILED: {
      const view_id_failed = payload.view_id || 'default'
      return state.updateIn(['task_table_views', view_id_failed], (view) => {
        return view.merge({
          task_is_fetching: false,
          task_is_fetching_more: false,
          task_table_error: payload.error
        })
      })
    }

    default:
      return state
  }
}

export default tasks_reducer
