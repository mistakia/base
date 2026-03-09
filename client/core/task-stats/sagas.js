import { takeLatest, fork, call } from 'redux-saga/effects'

import { get_task_stats } from '@core/api/sagas'
import { task_stats_action_types } from './actions'

export function* load_task_stats({ payload }) {
  yield call(get_task_stats, payload)
}

export function* watch_load_task_stats() {
  yield takeLatest(task_stats_action_types.LOAD_TASK_STATS, load_task_stats)
}

export const task_stats_sagas = [fork(watch_load_task_stats)]
