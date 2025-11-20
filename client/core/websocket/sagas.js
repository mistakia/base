import { call, takeLatest, select, fork, delay, put } from 'redux-saga/effects'

import { websocket_actions } from './actions'
import { app_actions } from '@core/app/actions'
import { get_app } from '@core/app/selectors'
import { open_websocket, close_websocket, websocket_is_open } from './service'

export function* disconnect() {
  yield call(close_websocket)
}

export function* connect() {
  const { user_public_key } = yield select(get_app)
  // Connect with user_public_key if available, otherwise connect without authentication
  // Server will send redacted events to unauthenticated clients
  yield call(open_websocket, user_public_key ? { user_public_key } : {})
}

export function* reconnect() {
  // Reconnect regardless of authentication status
  // Unauthenticated users should maintain connection for redacted events
  while (!websocket_is_open()) {
    yield call(connect)
    yield delay(2000) // TODO - increase delay each run
  }

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
