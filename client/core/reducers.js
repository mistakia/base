import { combineReducers } from 'redux-immutable'

import { app_reducer } from './app/index.js'
import { dialog_reducer } from './dialog/index.js'
import { threads_reducer } from './threads/index.js'
import { tasks_reducer } from './tasks/index.js'
import { directory_reducer } from './directory/index.js'
import { notification_reducer } from './notification/index.js'
import { active_sessions_reducer } from './active-sessions/index.js'
import { thread_prompt_reducer } from './thread-prompt/index.js'
import { activity_reducer } from './activity/index.js'

const root_reducer = (router) =>
  combineReducers({
    router,
    app: app_reducer,
    dialog: dialog_reducer,
    threads: threads_reducer,
    tasks: tasks_reducer,
    directory: directory_reducer,
    notification: notification_reducer,
    active_sessions: active_sessions_reducer,
    thread_prompt: thread_prompt_reducer,
    activity: activity_reducer
  })

export default root_reducer
