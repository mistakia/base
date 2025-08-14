import { takeLatest, fork, call, select } from 'redux-saga/effects'

import { get_threads, get_thread, get_models } from '@core/api/sagas'
import { threads_action_types } from './actions'
import { get_threads_state } from './selectors'

export function* load_threads({ payload }) {
  yield call(get_threads, payload)
}

export function* load_thread({ payload }) {
  yield call(get_thread, payload)

  // Fetch models data if not already loaded
  const threads_state = yield select(get_threads_state)
  const models_data = threads_state.getIn(['models_data', 'data'])
  if (!models_data) {
    yield call(get_models)
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

//= ====================================
//  ROOT
// -------------------------------------

export const threads_sagas = [fork(watch_load_threads), fork(watch_load_thread)]
