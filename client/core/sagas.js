import { all } from 'redux-saga/effects'

import { app_sagas } from './app'
import { tasks_saga } from './tasks'
import { websocket_sagas } from './websocket'

export default function* rootSage() {
  yield all([...app_sagas, ...tasks_saga, ...websocket_sagas])
}
