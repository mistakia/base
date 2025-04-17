import { call, put, cancelled, select } from 'redux-saga/effects'
// import { LOCATION_CHANGE } from 'redux-first-history'

import { api, api_request } from '@core/api/service'
import {
  post_user_task_request_actions,
  get_user_tasks_request_actions,
  get_task_request_actions
} from '@core/tasks/actions'
import { get_user_request_actions } from '@core/users/actions'
import {
  post_user_request_actions,
  post_user_session_request_actions
} from '@core/app/actions'
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
  post_thread_tool_request_actions,
  get_inference_providers_request_actions
} from '@core/thread/actions'
import { get_app } from '@core/app/selectors'

function* fetchAPI(api_function, actions, opts = {}) {
  const { token } = yield select(get_app)
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
export const post_user_session = fetch.bind(
  null,
  api.post_user_session,
  post_user_session_request_actions
)
export const post_user = fetch.bind(
  null,
  api.post_user,
  post_user_request_actions
)
export const post_user_task = fetch.bind(
  null,
  api.post_user_task,
  post_user_task_request_actions
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
export const get_user_tasks = fetch.bind(
  null,
  api.get_user_tasks,
  get_user_tasks_request_actions
)

export const get_task = fetch.bind(null, api.get_task, get_task_request_actions)

// Thread API saga functions
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

export const get_inference_providers = fetch.bind(
  null,
  api.get_inference_providers,
  get_inference_providers_request_actions
)
