import { takeLatest, fork, call } from 'redux-saga/effects'

import { get_active_sessions } from '@core/api/sagas'
import { active_sessions_action_types } from './actions'

//= ====================================
//  ACTIVE SESSIONS LOADING SAGAS
//= ====================================

export function* load_active_sessions() {
  yield call(get_active_sessions)
}

//= ====================================
//  WATCHERS
//= ====================================

export function* watch_load_active_sessions() {
  yield takeLatest(
    active_sessions_action_types.LOAD_ACTIVE_SESSIONS,
    load_active_sessions
  )
}

//= ====================================
//  ROOT SAGA EXPORT
//= ====================================

export const active_sessions_sagas = [fork(watch_load_active_sessions)]
