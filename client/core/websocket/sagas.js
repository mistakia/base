import { call, takeLatest, select, fork, delay, put } from 'redux-saga/effects'

import { websocket_actions } from './actions'
import { app_actions } from '@core/app/actions'
import { get_user_token } from '@core/app/selectors'
import { open_websocket, close_websocket, websocket_is_open } from './service'

export function* disconnect() {
  yield call(close_websocket)
}

export function* connect() {
  const user_token = yield select(get_user_token)
  // Connect with JWT token if available, otherwise connect without authentication
  // Server will send redacted events to unauthenticated clients
  yield call(open_websocket, user_token ? { token: user_token } : {})
}

const RECONNECT_MAX_RETRIES = 10
const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 60000

let reconnect_exhausted = false

export function* reconnect() {
  if (reconnect_exhausted) return

  // Reconnect regardless of authentication status
  // Unauthenticated users should maintain connection for redacted events
  let attempt = 0
  while (!websocket_is_open()) {
    if (attempt >= RECONNECT_MAX_RETRIES) {
      reconnect_exhausted = true
      yield put(websocket_actions.connection_failed())
      return
    }
    yield call(connect)
    if (!websocket_is_open()) {
      const backoff_delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, attempt),
        RECONNECT_MAX_DELAY
      )
      const jitter = Math.floor(Math.random() * backoff_delay * 0.1)
      yield delay(backoff_delay + jitter)
      attempt += 1
    }
  }

  // Successful reconnection resets the exhaustion flag
  reconnect_exhausted = false
  yield put(websocket_actions.reconnected())
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_keys() {
  yield takeLatest(app_actions.LOAD_KEYS, connect)
}

export function* watch_app_loaded() {
  // Connect WebSocket when app loads, regardless of authentication status
  // This ensures unauthenticated users can receive redacted events
  yield takeLatest(app_actions.APP_LOADED, connect)
}

export function* watch_websocket_close() {
  yield takeLatest(websocket_actions.WEBSOCKET_CLOSE, reconnect)
}

//= ====================================
//  ROOT
// -------------------------------------

export const websocket_sagas = [
  fork(watch_load_keys),
  fork(watch_app_loaded),
  fork(watch_websocket_close)
]
