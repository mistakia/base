import { call, put, cancelled } from 'redux-saga/effects'
// import { LOCATION_CHANGE } from 'redux-first-history'

import { api, api_request } from '@core/api/service'
import {
  get_tasks_request_actions,
  post_user_task_request_actions
} from '@core/tasks/actions'
import { get_user_request_actions } from '@core/users/actions'
import {
  post_user_request_actions,
  post_user_session_request_actions
} from '@core/app/actions'
import { get_path_views_request_actions } from '@core/path-views/actions'
import { get_folder_path_request_actions } from '@core/folder-paths/actions'

function* fetchAPI(apiFunction, actions, opts = {}) {
  const { abort, request } = api_request(apiFunction, opts)
  try {
    yield put(actions.pending(opts))
    const data = yield call(request)
    yield put(actions.fulfilled(opts, data))
  } catch (err) {
    console.log(err)
    if (!opts.ignoreError) {
      /* yield put(notificationActions.show({ severity: 'error', message: err.message }))
       * Bugsnag.notify(err, (event) => {
       *   event.addMetadata('options', opts)
       * }) */
    }
    yield put(actions.failed(opts, err.toString()))
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

export const get_tasks = fetch.bind(
  null,
  api.get_tasks,
  get_tasks_request_actions
)
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
export const get_path_views = fetch.bind(
  null,
  api.get_path_views,
  get_path_views_request_actions
)
export const get_folder_path = fetch.bind(
  null,
  api.get_folder_path,
  get_folder_path_request_actions
)
