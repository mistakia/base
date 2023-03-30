import { combineReducers } from 'redux-immutable'

import { app_reducer } from './app'
import { dialog_reducer } from './dialog'
import { tasks_reducer } from './tasks'

const root_reducer = (router) =>
  combineReducers({
    router,
    app: app_reducer,
    dialog: dialog_reducer,
    tasks: tasks_reducer
  })

export default root_reducer
