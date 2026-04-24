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
import { git_reducer } from './git/index.js'
import { commits_reducer } from './commits/index.js'
import { file_history_reducer } from './file-history/reducer.js'
import { search_reducer } from './search/index.js'
import { thread_sheet_reducer } from './thread-sheet/index.js'
import { task_stats_reducer } from './task-stats/index.js'
import { finance_reducer } from './finance/index.js'
import { physical_items_reducer } from './physical-items/index.js'

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
    activity: activity_reducer,
    git: git_reducer,
    commits: commits_reducer,
    file_history: file_history_reducer,
    search: search_reducer,
    thread_sheet: thread_sheet_reducer,
    task_stats: task_stats_reducer,
    finance: finance_reducer,
    physical_items: physical_items_reducer
  })

export default root_reducer
