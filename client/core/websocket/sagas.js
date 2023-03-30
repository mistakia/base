import { call, takeLatest, select, fork, delay, put } from 'redux-saga/effects'

import { websocketActions } from './actions'
import { get_app } from '@core/app'
import { openWebsocket, closeWebsocket, isOpen } from './service'

export function* disconnect() {
  yield call(closeWebsocket)
}

export function* connect() {
  const { public_key } = yield select(get_app)
  yield call(openWebsocket, { public_key })
}

export function* reconnect() {
  const { public_key } = yield select(get_app)
  if (public_key) {
    while (!isOpen()) {
      yield call(connect)
      yield delay(2000) // TODO - increase delay each run
    }

    yield put(websocketActions.reconnected())
  }
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watchWebSocketClose() {
  yield takeLatest(websocketActions.WEBSOCKET_CLOSE, reconnect)
}

//= ====================================
//  ROOT
// -------------------------------------

export const websocket_sagas = [fork(watchWebSocketClose)]
