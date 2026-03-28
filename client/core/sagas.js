import { all } from 'redux-saga/effects'

import { app_sagas } from './app/index.js'
import { websocket_sagas } from './websocket/index.js'
import { threads_sagas } from './threads/index.js'
import { tasks_sagas } from './tasks/index.js'
import { directory_sagas } from './directory/index.js'
import { active_sessions_sagas } from './active-sessions/index.js'
import { activity_sagas } from './activity/index.js'
import { git_sagas } from './git/index.js'
import { commits_sagas } from './commits/index.js'
import { search_sagas } from './search/index.js'
import { thread_sheet_sagas } from './thread-sheet/index.js'
import { task_stats_sagas } from './task-stats/index.js'
import { finance_sagas } from './finance/index.js'
import { physical_items_sagas } from './physical-items/index.js'

export default function* root_saga() {
  yield all([
    ...app_sagas,
    ...websocket_sagas,
    ...threads_sagas,
    ...tasks_sagas,
    ...directory_sagas,
    ...active_sessions_sagas,
    ...activity_sagas,
    ...git_sagas,
    ...commits_sagas,
    ...search_sagas,
    ...thread_sheet_sagas,
    ...task_stats_sagas,
    ...finance_sagas,
    ...physical_items_sagas
  ])
}
