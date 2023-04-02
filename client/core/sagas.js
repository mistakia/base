import { all } from 'redux-saga/effects'

import { app_sagas } from './app'
import { tasks_saga } from './tasks'
import { websocket_sagas } from './websocket'
import { users_saga } from './users'
import { folder_path_sagas } from './folder-paths'

export default function* rootSage() {
  yield all([
    ...app_sagas,
    ...tasks_saga,
    ...websocket_sagas,
    ...users_saga,
    ...folder_path_sagas
  ])
}
