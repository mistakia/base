import { takeLatest, fork, call, select, debounce } from 'redux-saga/effects'

import { get_tasks, get_tasks_table } from '@core/api/sagas'
import { tasks_action_types } from './actions'
import { get_tasks_state } from './selectors'

export function* load_tasks({ payload }) {
  yield call(get_tasks, payload)
}

export function* load_tasks_table_data({ payload }) {
  try {
    const tasks_state = yield select(get_tasks_state)
    const { view_id, is_append = false } = payload || {}

    // Use provided view_id or get selected view from state, defaulting to 'open'
    const resolved_view_id =
      view_id || tasks_state.get('selected_task_table_view_id') || 'open'

    // Use current table state from the specified view
    const selected_view = tasks_state.getIn([
      'task_table_views',
      resolved_view_id
    ])
    let table_state = selected_view.get('task_table_state')
    table_state = table_state?.toJS ? table_state.toJS() : table_state

    // For append requests, adjust offset based on current rows fetched
    if (is_append) {
      const task_total_rows_fetched = selected_view.get(
        'task_total_rows_fetched'
      )
      table_state = {
        ...table_state,
        offset: task_total_rows_fetched
      }
    }

    yield call(get_tasks_table, {
      table_state,
      is_append,
      view_id: resolved_view_id
    })
  } catch (error) {
    console.error('Error loading tasks table data:', error)
  }
}

export function* debounced_table_state_fetch({ payload }) {
  try {
    // Get the view from payload or use selected view
    const tasks_state = yield select(get_tasks_state)
    const { view } = payload
    const view_id =
      view?.view_id || tasks_state.get('selected_task_table_view_id') || 'open'
    const selected_view = tasks_state.getIn(['task_table_views', view_id])

    // Use table_state from the view object if provided, otherwise from selected_view
    const table_state =
      view?.table_state || selected_view.get('task_table_state')
    let serialized_state = table_state?.toJS ? table_state.toJS() : table_state

    // Ensure table_state has limit and offset, with defaults
    if (!serialized_state.limit) {
      serialized_state = { ...serialized_state, limit: 1000 }
    }
    if (!serialized_state.offset) {
      serialized_state = { ...serialized_state, offset: 0 }
    }

    yield call(get_tasks_table, {
      table_state: serialized_state,
      is_append: false,
      view_id
    })
  } catch (error) {
    console.error('Error in debounced table state fetch:', error)
  }
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_tasks() {
  yield takeLatest(tasks_action_types.LOAD_TASKS, load_tasks)
}

// Table view management watchers
export function* watch_update_task_table_view() {
  // Debounce table view changes by 300ms to prevent excessive server calls
  yield debounce(
    300,
    tasks_action_types.UPDATE_TASK_TABLE_VIEW,
    debounced_table_state_fetch
  )
}

export function* watch_load_tasks_table() {
  yield takeLatest(tasks_action_types.LOAD_TASKS_TABLE, load_tasks_table_data)
}

//= ====================================
//  ROOT
// -------------------------------------

export const tasks_sagas = [
  fork(watch_load_tasks),
  fork(watch_update_task_table_view),
  fork(watch_load_tasks_table)
]
