import { call, takeLatest, fork, select } from 'redux-saga/effects'

import { app_actions, get_app } from '@core/app'
import { get_tasks } from '@core/api'

export function* load_tasks() {
  const { public_key } = yield select(get_app)
  if (!public_key) {
    return
  }
  yield call(get_tasks, { public_key })
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_app_loaded() {
  yield takeLatest(app_actions.APP_LOADED, load_tasks)
}

//= ====================================
//  ROOT
// -------------------------------------

export const tasks_saga = [fork(watch_app_loaded)]
