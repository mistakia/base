import { takeLatest, fork, call } from 'redux-saga/effects'

import {
  get_threads,
  get_thread,
  get_thread_timeline,
  get_thread_metadata
} from '@core/api/sagas'
import { threads_action_types } from './actions'

export function* load_threads({ payload }) {
  yield call(get_threads, payload)
}

export function* load_thread({ payload }) {
  yield call(get_thread, payload)
}

export function* load_thread_timeline({ payload }) {
  yield call(get_thread_timeline, payload)
}

export function* load_thread_metadata({ payload }) {
  yield call(get_thread_metadata, payload)
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

export function* watch_load_thread_timeline() {
  yield takeLatest(
    threads_action_types.LOAD_THREAD_TIMELINE,
    load_thread_timeline
  )
}

export function* watch_load_thread_metadata() {
  yield takeLatest(
    threads_action_types.LOAD_THREAD_METADATA,
    load_thread_metadata
  )
}

//= ====================================
//  ROOT
// -------------------------------------

export const threads_sagas = [
  fork(watch_load_threads),
  fork(watch_load_thread),
  fork(watch_load_thread_timeline),
  fork(watch_load_thread_metadata)
]
