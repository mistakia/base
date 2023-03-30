import { call, takeLatest, select, fork, delay, put } from 'redux-saga/effects'

import { websocket_actions } from './actions'
import { get_app } from '@core/app'
import { open_websocket, close_websocket, websocket_is_open } from './service'

export function* disconnect() {
  yield call(close_websocket)
}

export function* connect() {
  const { public_key } = yield select(get_app)
  yield call(open_websocket, { public_key })
}

export function* reconnect() {
  const { public_key } = yield select(get_app)
  if (public_key) {
    while (!websocket_is_open()) {
      yield call(connect)
      yield delay(2000) // TODO - increase delay each run
    }

    yield put(websocket_actions.reconnected())
  }
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_websocket_close() {
  yield takeLatest(websocket_actions.WEBSOCKET_CLOSE, reconnect)
}

//= ====================================
//  ROOT
// -------------------------------------

export const websocket_sagas = [fork(watch_websocket_close)]
