import { call, takeLatest, fork, select } from 'redux-saga/effects'

import { get_app } from '@core/app'
import { get_tasks, post_user_task } from '@core/api'
import { task_actions } from './actions'
import Ed25519 from 'nanocurrency-web/dist/lib/ed25519'
import Convert from 'nanocurrency-web/dist/lib/util/convert'
import { blake2b } from 'blakejs'

export function* load_user_tasks({ payload }) {
  const { user_id } = payload
  yield call(get_tasks, { user_id })
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
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_user_tasks() {
  yield takeLatest(task_actions.LOAD_USER_TASKS, load_user_tasks)
}

export function* watch_post_user_task() {
  yield takeLatest(task_actions.CREATE_USER_TASK, create_user_task)
}

//= ====================================
//  ROOT
// -------------------------------------

export const tasks_saga = [
  fork(watch_load_user_tasks),
  fork(watch_post_user_task)
]
