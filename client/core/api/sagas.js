import { call, put, cancelled, select } from 'redux-saga/effects'
// import { LOCATION_CHANGE } from 'redux-first-history'

import { api, api_request } from '@core/api/service'
import { get_tasks_actions, get_tasks_table_actions } from '@core/tasks/actions'
import {
  get_user_request_actions,
  get_users_request_actions
} from '@core/users/actions'
import { post_user_session_request_actions } from '@core/app/actions'
import {
  post_database_view_request_actions,
  delete_database_view_request_actions
} from '@core/path-views/actions'
import {
  get_database_request_actions,
  get_database_items_request_actions
} from '@core/database-tables/actions'
import {
  post_thread_request_actions,
  get_threads_request_actions,
  get_thread_request_actions,
  post_thread_message_request_actions,
  put_thread_state_request_actions,
  post_thread_tool_request_actions
} from '@core/thread/actions'
import {
  get_models_actions,
  get_threads_table_actions,
  create_thread_session_actions,
  resume_thread_session_actions
} from '@core/threads/actions'

import {
  get_directories_request_actions,
  get_file_content_request_actions,
  get_path_info_request_actions
} from '@core/directory/actions'
import { get_active_sessions_actions } from '@core/active-sessions/actions'
import { get_activity_heatmap_actions } from '@core/activity/actions'
import { get_app } from '@core/app/selectors'

function* fetchAPI(api_function, actions, opts = {}) {
  const app = yield select(get_app)
  const token = app.get('user_token')
  const { abort, request } = api_request(api_function, opts, token)
  try {
    yield put(actions.pending({ opts }))
    const data = yield call(request)
    yield put(actions.fulfilled({ opts, data }))
  } catch (err) {
    console.log(err)
    if (!opts.ignoreError) {
      /* yield put(notificationActions.show({ severity: 'error', message: err.message }))
       * Bugsnag.notify(err, (event) => {
       *   event.addMetadata('options', opts)
       * }) */
    }
    yield put(actions.failed({ opts, error: err.toString() }))
  } finally {
    if (yield cancelled()) {
      abort()
    }
  }
}

function* fetch(...args) {
  yield call(fetchAPI.bind(null, ...args))
  // yield race([call(fetchAPI.bind(null, ...args)), take(LOCATION_CHANGE)])
}

export const get_user = fetch.bind(null, api.get_user, get_user_request_actions)
export const get_users = fetch.bind(
  null,
  api.get_users,
  get_users_request_actions
)
export const post_user_session = fetch.bind(
  null,
  api.post_user_session,
  post_user_session_request_actions
)
export const get_database = fetch.bind(
  null,
  api.get_database,
  get_database_request_actions
)
export const get_database_items = fetch.bind(
  null,
  api.get_database_items,
  get_database_items_request_actions
)
export const post_database_view = fetch.bind(
  null,
  api.post_database_view,
  post_database_view_request_actions
)
export const delete_database_view = fetch.bind(
  null,
  api.delete_database_view,
  delete_database_view_request_actions
)
export const get_tasks = fetch.bind(null, api.get_tasks, get_tasks_actions)

export const get_threads = fetch.bind(
  null,
  api.get_threads,
  get_threads_request_actions
)

export const get_thread = fetch.bind(
  null,
  api.get_thread,
  get_thread_request_actions
)

export const post_thread = fetch.bind(
  null,
  api.post_thread,
  post_thread_request_actions
)

export const post_thread_message = fetch.bind(
  null,
  api.post_thread_message,
  post_thread_message_request_actions
)

export const put_thread_state = fetch.bind(
  null,
  api.put_thread_state,
  put_thread_state_request_actions
)

export const post_thread_execute_tool = fetch.bind(
  null,
  api.post_thread_execute_tool,
  post_thread_tool_request_actions
)

export const get_models = fetch.bind(null, api.get_models, get_models_actions)

// Create thread session via CLI
export const create_thread_session = fetch.bind(
  null,
  api.create_thread_session,
  create_thread_session_actions
)

// Resume thread session via CLI
export const resume_thread_session = fetch.bind(
  null,
  api.resume_thread_session,
  resume_thread_session_actions
)

// Threads table processing saga
export const get_threads_table = fetch.bind(
  null,
  api.get_threads_table,
  get_threads_table_actions
)

// Tasks table processing saga
export const get_tasks_table = fetch.bind(
  null,
  api.get_tasks_table,
  get_tasks_table_actions
)

export const get_directories = fetch.bind(
  null,
  api.get_directories,
  get_directories_request_actions
)

export const get_file_content = fetch.bind(
  null,
  api.get_file_content,
  get_file_content_request_actions
)

export const get_path_info = fetch.bind(
  null,
  api.get_path_info,
  get_path_info_request_actions
)

export const get_active_sessions = fetch.bind(
  null,
  api.get_active_sessions,
  get_active_sessions_actions
)

export const get_activity_heatmap = fetch.bind(
  null,
  api.get_activity_heatmap,
  get_activity_heatmap_actions
)

// Delete active session - best effort operation
// Note: Caller should dispatch active_session_ended action to update Redux state
export function* delete_active_session({ session_id }) {
  const app = yield select(get_app)
  const token = app.get('user_token')
  const { abort, request } = api_request(
    api.delete_active_session,
    { session_id },
    token
  )
  try {
    yield call(request)
  } catch (err) {
    // Log but don't throw - session might already be removed server-side
    // Caller should still update Redux state since deletion may have succeeded
    console.log('Error deleting active session:', err)
  } finally {
    if (yield cancelled()) {
      abort()
    }
  }
}
