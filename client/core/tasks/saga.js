import { call, takeLatest, fork, select } from 'redux-saga/effects'

import { app_actions, get_app } from '@core/app'
import { get_tasks } from '@core/api'

export function* load_tasks() {
  const { user_id } = yield select(get_app)
  if (!user_id) {
    return
  }
  yield call(get_tasks, { user_id })
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
