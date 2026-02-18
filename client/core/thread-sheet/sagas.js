import { takeEvery, fork, call } from 'redux-saga/effects'

import { get_sheet_thread } from '@core/api/sagas'
import { thread_sheet_action_types } from './actions'

export function* load_sheet_thread({ payload }) {
  yield call(get_sheet_thread, payload)
}

export function* watch_load_sheet_thread() {
  yield takeEvery(
    thread_sheet_action_types.LOAD_SHEET_THREAD,
    load_sheet_thread
  )
}

export const thread_sheet_sagas = [fork(watch_load_sheet_thread)]
