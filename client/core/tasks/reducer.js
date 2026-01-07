import { Record, List, Map } from 'immutable'

import { tasks_action_types } from './actions'
import { task_columns } from '@views/components/TasksTable/index.js'
import { TABLE_OPERATORS } from 'react-table/src/constants.mjs'
import { TASK_STATUS } from '@libs-shared/task-constants.mjs'
import { create_default_table_state } from '@core/table/create-default-table-state.js'
import { create_view } from '@core/table/create-view.js'
import {
  update_view_on_config_change,
  on_table_pending,
  on_table_fulfilled,
  on_table_failed
} from '@core/table/table-reducer-helpers.js'

const DEFAULT_TASK_TABLE_STATE = create_default_table_state({
  columns: [
    'title',
    'status',
    'priority',
    'finish_by',
    'assigned_to',
    'created_at',
    'updated_at'
  ],
  sort: [{ column_id: 'created_at', desc: true }]
})

// Default views
const DEFAULT_VIEWS = {
  default: create_view({
    entity_prefix: 'task',
    view_id: 'default',
    view_name: 'All Tasks',
    table_state: DEFAULT_TASK_TABLE_STATE
  }),
  open: create_view({
    entity_prefix: 'task',
    view_id: 'open',
    view_name: 'Open Tasks',
    table_state: create_default_table_state({
      columns: [
        'title',
        'status',
        'priority',
        'finish_by',
        'assigned_to',
        'created_at',
        'updated_at'
      ],
      sort: [
        { column_id: 'priority', desc: true },
        { column_id: 'finish_by', desc: false }
      ],
      where: new List([
        new Map({
          column_id: 'status',
          operator: TABLE_OPERATORS.NOT_IN,
          value: [TASK_STATUS.COMPLETED, TASK_STATUS.ABANDONED]
        })
      ])
    })
  }),
  active: create_view({
    entity_prefix: 'task',
    view_id: 'active',
    view_name: 'Active Tasks',
    table_state: create_default_table_state({
      columns: [
        'title',
        'status',
        'priority',
        'finish_by',
        'assigned_to',
        'created_at',
        'updated_at'
      ],
      sort: [{ column_id: 'created_at', desc: true }],
      where: new List([
        new Map({
          column_id: 'status',
          operator: TABLE_OPERATORS.IN,
          value: [TASK_STATUS.STARTED, TASK_STATUS.IN_PROGRESS]
        })
      ])
    })
  }),
  upcoming: create_view({
    entity_prefix: 'task',
    view_id: 'upcoming',
    view_name: 'Upcoming Tasks',
    table_state: create_default_table_state({
      columns: [
        'title',
        'status',
        'priority',
        'finish_by',
        'assigned_to',
        'created_at',
        'updated_at'
      ],
      sort: [{ column_id: 'created_at', desc: true }],
      where: new List([
        new Map({
          column_id: 'status',
          operator: TABLE_OPERATORS.IN,
          value: [TASK_STATUS.PLANNED]
        })
      ])
    })
  })
}

const TasksState = new Record({
  // Basic tasks list for simple get_tasks API calls
  tasks: new List(),
  tag_visibility: new Map(),
  is_loading_tasks: false,
  tasks_error: null,

  // Table views management
  task_table_views: new Map(DEFAULT_VIEWS),
  selected_task_table_view_id: 'open',
  task_all_columns: Map(task_columns)
})

export function tasks_reducer(state = new TasksState(), { payload, type }) {
  switch (type) {
    case tasks_action_types.GET_TASKS_PENDING:
      return state.merge({
        is_loading_tasks: true,
        tasks_error: null
      })

    case tasks_action_types.GET_TASKS_FULFILLED: {
      // Handle both old array format and new object format
      const data = payload.data || {}
      const tasks = Array.isArray(data) ? data : data.tasks || []
      const tag_visibility = data.tag_visibility || {}
      return state.merge({
        tasks: new List(tasks),
        tag_visibility: new Map(tag_visibility),
        is_loading_tasks: false,
        tasks_error: null
      })
    }

    case tasks_action_types.GET_TASKS_FAILED:
      return state.merge({
        is_loading_tasks: false,
        tasks_error: payload.error
      })

    // Table view management actions
    case tasks_action_types.UPDATE_TASK_TABLE_VIEW: {
      const { view } = payload
      const view_id = view?.view_id || 'default'
      return state.updateIn(['task_table_views', view_id], (existing_view) =>
        update_view_on_config_change({
          view: existing_view,
          entity_prefix: 'task',
          view_id,
          view_name: view?.view_name,
          table_state: view?.table_state
        })
      )
    }

    case tasks_action_types.SELECT_TASK_TABLE_VIEW:
      return state.set('selected_task_table_view_id', payload.view_id)

    case tasks_action_types.GET_TASKS_TABLE_PENDING: {
      const view_id_pending = payload.view_id || 'default'
      return state.updateIn(['task_table_views', view_id_pending], (view) =>
        on_table_pending({
          view,
          entity_prefix: 'task',
          is_append: payload.opts?.is_append
        })
      )
    }

    case tasks_action_types.GET_TASKS_TABLE_FULFILLED: {
      const is_append = payload.opts?.is_append || false
      const view_id_fulfilled = payload.opts?.view_id || 'default'
      const rows = Array.isArray(payload.data?.rows) ? payload.data.rows : []
      const task_total_row_count =
        typeof payload.data?.total_row_count === 'number'
          ? payload.data.total_row_count
          : 0

      return state.updateIn(['task_table_views', view_id_fulfilled], (view) =>
        on_table_fulfilled({
          view,
          entity_prefix: 'task',
          rows,
          is_append,
          total_row_count: task_total_row_count
        })
      )
    }

    case tasks_action_types.GET_TASKS_TABLE_FAILED: {
      const view_id_failed = payload.view_id || 'default'
      return state.updateIn(['task_table_views', view_id_failed], (view) =>
        on_table_failed({
          view,
          entity_prefix: 'task',
          error: payload.error
        })
      )
    }

    // Task property update actions (optimistic updates)
    case tasks_action_types.UPDATE_TASK_PROPERTY: {
      const { base_uri, property_name, value } = payload
      return state.update('task_table_views', (views) =>
        views.map((view) =>
          view.update('task_table_results', (rows) => {
            if (!rows) return rows
            const index = rows.findIndex((row) => row.base_uri === base_uri)
            if (index === -1) return rows
            return rows.update(index, (row) => ({
              ...row,
              [property_name]: value
            }))
          })
        )
      )
    }

    case tasks_action_types.REVERT_TASK_UPDATE: {
      const { base_uri, property_name, previous_value } = payload
      return state.update('task_table_views', (views) =>
        views.map((view) =>
          view.update('task_table_results', (rows) => {
            if (!rows) return rows
            const index = rows.findIndex((row) => row.base_uri === base_uri)
            if (index === -1) return rows
            return rows.update(index, (row) => ({
              ...row,
              [property_name]: previous_value
            }))
          })
        )
      )
    }

    default:
      return state
  }
}

export default tasks_reducer
