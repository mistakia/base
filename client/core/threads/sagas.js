import {
  takeLatest,
  fork,
  call,
  select,
  put,
  debounce
} from 'redux-saga/effects'

import {
  get_threads,
  get_thread,
  get_models,
  load_threads_table
} from '@core/api/sagas'
import { threads_action_types, threads_actions } from './actions'
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

// Table state management sagas

export function* update_threads_table_state({ payload }) {
  // Update the table state in Redux
  yield put(threads_actions.update_threads_table_state(payload.table_state))

  // Debounced fetch will be triggered by watcher
}

export function* load_threads_table_data({ payload }) {
  try {
    const { table_state, user_public_key, is_append = false } = payload

    // If no table_state provided, use current state from Redux
    let final_table_state = table_state
    if (!final_table_state) {
      const threads_state = yield select(get_threads_state)
      final_table_state = threads_state.get('table_state')
      final_table_state = final_table_state?.toJS
        ? final_table_state.toJS()
        : final_table_state
    }

    // Ensure table_state has limit and offset, with defaults
    if (!final_table_state.limit) {
      final_table_state = { ...final_table_state, limit: 1000 }
    }
    if (!final_table_state.offset) {
      final_table_state = { ...final_table_state, offset: 0 }
    }

    yield call(load_threads_table, {
      table_state: final_table_state,
      user_public_key,
      is_append
    })

    // Ensure models data is loaded for cost calculations
    yield call(ensure_models_data_loaded)
  } catch (error) {
    console.error('Error loading threads table data:', error)
  }
}

export function* debounced_table_state_fetch() {
  // Get current table state and fetch data
  const threads_state = yield select(get_threads_state)
  const table_state = threads_state.get('table_state')
  let serialized_state = table_state?.toJS ? table_state.toJS() : table_state

  // Ensure table_state has limit and offset, with defaults
  if (!serialized_state.limit) {
    serialized_state = { ...serialized_state, limit: 1000 }
  }
  if (!serialized_state.offset) {
    serialized_state = { ...serialized_state, offset: 0 }
  }

  yield call(load_threads_table, {
    table_state: serialized_state,
    is_append: false
  })
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

// Table state management watchers
export function* watch_update_threads_table_state() {
  // Debounce table state changes by 300ms to prevent excessive server calls
  yield debounce(
    300,
    threads_action_types.UPDATE_THREADS_TABLE_STATE,
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
  fork(watch_update_threads_table_state),
  fork(watch_load_threads_table)
]
