import { takeLatest, call, fork } from 'redux-saga/effects'

import { get_user, get_users } from '@core/api'
import { user_actions } from './actions'

export function* load_user({ payload }) {
  const { username } = payload
  yield call(get_user, { username })
}

export function* load_users() {
  yield call(get_users)
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_user() {
  yield takeLatest(user_actions.LOAD_USER, load_user)
}

export function* watch_load_users() {
  yield takeLatest(user_actions.LOAD_USERS, load_users)
}

//= ====================================
//  ROOT
// -------------------------------------

export const users_saga = [fork(watch_load_user), fork(watch_load_users)]
