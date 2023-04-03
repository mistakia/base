import { combineReducers } from 'redux-immutable'

import { app_reducer } from './app'
import { dialog_reducer } from './dialog'
import { users_reducer } from './users'
import { path_views_reducer } from './path-views'
import { database_table_items_reducer } from './database-tables'

const root_reducer = (router) =>
  combineReducers({
    router,
    app: app_reducer,
    dialog: dialog_reducer,
    users: users_reducer,
    path_views: path_views_reducer,
    database_table_items: database_table_items_reducer
  })

export default root_reducer
