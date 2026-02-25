import {
  takeLatest,
  takeEvery,
  fork,
  call,
  delay,
  put,
  select,
  race,
  take
} from 'redux-saga/effects'

import { get_active_sessions } from '@core/api/sagas'
import { active_sessions_action_types } from './actions'
import { websocket_actions } from '@core/websocket/actions'

//= ====================================
//  ACTIVE SESSIONS LOADING SAGAS
//= ====================================

export function* load_active_sessions() {
  yield call(get_active_sessions)
}

//= ====================================
//  AUTO-DISMISS ENDED SESSIONS
//= ====================================

const DISMISS_DELAY_WITH_THREAD = 5 * 60 * 1000
const DISMISS_DELAY_WITHOUT_THREAD = 60000

export function* auto_dismiss_ended_session({ payload }) {
  const { session_id } = payload

  // Check if session ended with a thread (kept inline in sessions map)
  const active_session = yield select((state) =>
    state.getIn(['active_sessions', 'sessions', session_id])
  )
  const has_thread_inline = active_session && !!active_session.get('thread_id')

  if (!has_thread_inline) {
    // Sessions without threads are in ended_sessions -- auto-dismiss after 60s
    const ended_session = yield select((state) =>
      state.getIn(['active_sessions', 'ended_sessions', session_id])
    )
    if (!ended_session) return
  }

  const dismiss_delay = has_thread_inline
    ? DISMISS_DELAY_WITH_THREAD
    : DISMISS_DELAY_WITHOUT_THREAD

  // Race: auto-dismiss after delay OR cancel if manually dismissed first
  const { timeout } = yield race({
    timeout: delay(dismiss_delay),
    dismissed: take(
      (action) =>
        action.type === active_sessions_action_types.DISMISS_ENDED_SESSION &&
        action.payload.session_id === session_id
    )
  })

  // Before dismissing, re-check if a late THREAD_CREATED linked a thread
  // (handles the case where thread creation happens after session end)
  if (timeout) {
    const current_ended = yield select((state) =>
      state.getIn(['active_sessions', 'ended_sessions', session_id])
    )
    if (current_ended && current_ended.get('thread_id')) {
      // Thread was linked after session ended -- don't auto-dismiss
      return
    }

    yield put({
      type: active_sessions_action_types.DISMISS_ENDED_SESSION,
      payload: { session_id }
    })
  }
}

//= ====================================
//  RECONNECT RECOVERY
//= ====================================

export function* reconnect_recovery() {
  yield put({
    type: active_sessions_action_types.LOAD_ACTIVE_SESSIONS
  })
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

export function* watch_session_ended() {
  yield takeEvery(
    active_sessions_action_types.ACTIVE_SESSION_ENDED,
    auto_dismiss_ended_session
  )
}

export function* watch_websocket_reconnected() {
  yield takeLatest(websocket_actions.WEBSOCKET_RECONNECTED, reconnect_recovery)
}

//= ====================================
//  ROOT SAGA EXPORT
//= ====================================

export const active_sessions_sagas = [
  fork(watch_load_active_sessions),
  fork(watch_session_ended),
  fork(watch_websocket_reconnected)
]
