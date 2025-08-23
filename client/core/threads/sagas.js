import { takeLatest, fork, call, select, debounce } from 'redux-saga/effects'

import {
  get_threads,
  get_thread,
  get_models,
  get_threads_table
} from '@core/api/sagas'
import { threads_action_types } from './actions'
import { get_threads_state } from './selectors'

function* ensure_models_data_loaded() {
  const threads_state = yield select(get_threads_state)
  const models_data = threads_state.getIn(['models_data', 'data'])
  if (!models_data) {
    yield call(get_models)
  }
}

export function* load_threads({ payload }) {
  yield call(get_threads, payload)
  yield call(ensure_models_data_loaded)
}

export function* load_thread({ payload }) {
  yield call(get_thread, payload)
  yield call(ensure_models_data_loaded)
}

// Table view management sagas

export function* load_threads_table_data({ payload }) {
  try {
    const { view_id = 'default', is_append = false } = payload

    // Use current table state from the specified view
    const threads_state = yield select(get_threads_state)
    const selected_view = threads_state.getIn(['thread_table_views', view_id])
    let table_state = selected_view.get('thread_table_state')
    table_state = table_state?.toJS ? table_state.toJS() : table_state

    // For append requests, adjust offset based on current rows fetched
    if (is_append) {
      const thread_total_rows_fetched = selected_view.get(
        'thread_total_rows_fetched'
      )
      table_state = {
        ...table_state,
        offset: thread_total_rows_fetched
      }
    }

    yield call(get_threads_table, {
      table_state,
      is_append,
      view_id
    })

    // Ensure models data is loaded for cost calculations
    yield call(ensure_models_data_loaded)
  } catch (error) {
    console.error('Error loading threads table data:', error)
  }
}

export function* debounced_table_state_fetch({ payload }) {
  try {
    // Get the view from payload or use selected view
    const threads_state = yield select(get_threads_state)
    const { view } = payload
    const view_id =
      view?.view_id ||
      threads_state.get('selected_thread_table_view_id') ||
      'default'
    const selected_view = threads_state.getIn(['thread_table_views', view_id])

    // Use table_state from the view object if provided, otherwise from selected_view
    const table_state =
      view?.table_state || selected_view.get('thread_table_state')
    let serialized_state = table_state?.toJS ? table_state.toJS() : table_state

    // Ensure table_state has limit and offset, with defaults
    if (!serialized_state.limit) {
      serialized_state = { ...serialized_state, limit: 1000 }
    }
    if (!serialized_state.offset) {
      serialized_state = { ...serialized_state, offset: 0 }
    }

    yield call(get_threads_table, {
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

export function* watch_load_threads() {
  yield takeLatest(threads_action_types.LOAD_THREADS, load_threads)
}

export function* watch_load_thread() {
  yield takeLatest(threads_action_types.LOAD_THREAD, load_thread)
}

// Table view management watchers
export function* watch_update_thread_table_view() {
  // Debounce table view changes by 300ms to prevent excessive server calls
  yield debounce(
    300,
    threads_action_types.UPDATE_THREAD_TABLE_VIEW,
    debounced_table_state_fetch
  )
}

export function* watch_load_threads_table() {
  yield takeLatest(
    threads_action_types.LOAD_THREADS_TABLE,
    load_threads_table_data
  )
}

//= ====================================
//  ROOT
// -------------------------------------

export const threads_sagas = [
  fork(watch_load_threads),
  fork(watch_load_thread),
  fork(watch_update_thread_table_view),
  fork(watch_load_threads_table)
]
