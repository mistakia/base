import { all } from 'redux-saga/effects'

import { app_sagas } from './app'
import { database_sagas } from './database-tables'
import { tasks_saga } from './tasks'
import { websocket_sagas } from './websocket'
import { users_saga } from './users'
import { folder_path_sagas } from './folder-paths'
import { path_views_sagas } from './path-views'

export default function* rootSage() {
  yield all([
    ...app_sagas,
    ...database_sagas,
    ...tasks_saga,
    ...websocket_sagas,
    ...users_saga,
    ...folder_path_sagas,
    ...path_views_sagas
  ])
}
