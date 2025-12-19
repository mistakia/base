import { all } from 'redux-saga/effects'

import { app_sagas } from './app/index.js'
import { websocket_sagas } from './websocket/index.js'
import { threads_sagas } from './threads/index.js'
import { tasks_sagas } from './tasks/index.js'
import { directory_sagas } from './directory/index.js'
import { active_sessions_sagas } from './active-sessions/index.js'

export default function* root_saga() {
  yield all([
    ...app_sagas,
    ...websocket_sagas,
    ...threads_sagas,
    ...tasks_sagas,
    ...directory_sagas,
    ...active_sessions_sagas
  ])
}
