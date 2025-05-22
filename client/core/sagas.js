import { all } from 'redux-saga/effects'

import { app_sagas } from './app'
import { database_sagas } from './database-tables'
import { tasks_sagas } from './tasks'
import { websocket_sagas } from './websocket'
import { users_saga } from './users'
import { path_views_sagas } from './path-views'
import { thread_sagas } from './thread'
import { entity_sagas } from './entity/sagas'

export default function* rootSage() {
  yield all([
    ...app_sagas,
    ...database_sagas,
    ...tasks_sagas,
    ...websocket_sagas,
    ...users_saga,
    ...path_views_sagas,
    ...thread_sagas,
    ...entity_sagas
  ])
}
