import { takeLatest, fork, call } from 'redux-saga/effects'

import { get_threads, get_thread } from '@core/api/sagas'
import { threads_action_types } from './actions'

export function* load_threads({ payload }) {
  yield call(get_threads, payload)
}

export function* load_thread({ payload }) {
  yield call(get_thread, payload)
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
