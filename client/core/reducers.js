import { combineReducers } from 'redux-immutable'

import { app_reducer } from './app/index.js'
import { dialog_reducer } from './dialog/index.js'
import { threads_reducer } from './threads/index.js'
import { tasks_reducer } from './tasks/index.js'
import { directory_reducer } from './directory/index.js'

const root_reducer = (router) =>
  combineReducers({
    router,
    app: app_reducer,
    dialog: dialog_reducer,
    threads: threads_reducer,
    tasks: tasks_reducer,
    directory: directory_reducer
  })

export default root_reducer
