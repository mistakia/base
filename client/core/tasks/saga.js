import { call, takeLatest, fork } from 'redux-saga/effects'

import { get_tasks } from '@core/api'
import { task_actions } from './actions'

export function* load_user_tasks({ payload }) {
  const { user_id } = payload
  yield call(get_tasks, { user_id })
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_user_tasks() {
  yield takeLatest(task_actions.LOAD_USER_TASKS, load_user_tasks)
}

//= ====================================
//  ROOT
// -------------------------------------

export const tasks_saga = [fork(watch_load_user_tasks)]
