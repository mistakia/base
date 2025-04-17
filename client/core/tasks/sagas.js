import { call, takeLatest, fork, select } from 'redux-saga/effects'

import { get_app } from '@core/app'
import { get_user_tasks, post_user_task, get_task } from '@core/api'
import { task_actions } from './actions'
import Ed25519 from 'nanocurrency-web/dist/lib/ed25519'
import Convert from 'nanocurrency-web/dist/lib/util/convert'
import { blake2b } from 'blakejs'

export function* load_user_tasks() {
  const { user_id } = yield select(get_app)
  yield call(get_user_tasks, { user_id })
}

export function* create_user_task({ payload }) {
  const { text_input } = payload
  const task = { text_input }
  const { private_key, user_id } = yield select(get_app)
  const hash = blake2b(JSON.stringify(task), null, 32)
  const signature = new Ed25519().sign(hash, Convert.hex2ab(private_key))
  yield call(post_user_task, {
    task,
    user_id,
    signature: Convert.ab2hex(signature)
  })
  yield call(load_user_tasks)
}

export function* load_task({ payload }) {
  const { task_id } = payload
  const { user_id } = yield select(get_app)
  yield call(get_task, { task_id, user_id })
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_user_tasks() {
  yield takeLatest(task_actions.LOAD_USER_TASKS, load_user_tasks)
}

export function* watch_create_user_task() {
  yield takeLatest(task_actions.CREATE_USER_TASK, create_user_task)
}

export function* watch_load_task() {
  yield takeLatest(task_actions.LOAD_TASK, load_task)
}

//= ====================================
//  ROOT
// -------------------------------------

export const tasks_sagas = [
  fork(watch_load_user_tasks),
  fork(watch_create_user_task),
  fork(watch_load_task)
]
