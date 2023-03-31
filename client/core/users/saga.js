import { takeLatest, call, fork } from 'redux-saga/effects'

import { get_user } from '@core/api'
import { user_actions } from './actions'

export function* load_user({ payload }) {
  const { username } = payload
  yield call(get_user, { username })
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_user() {
  yield takeLatest(user_actions.LOAD_USER, load_user)
}

//= ====================================
//  ROOT
// -------------------------------------

export const users_saga = [fork(watch_load_user)]
