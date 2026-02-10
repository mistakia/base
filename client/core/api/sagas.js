import { call, put, cancelled, select } from 'redux-saga/effects'
// import { LOCATION_CHANGE } from 'redux-first-history'

import { api, api_request } from '@core/api/service'
import {
  get_tasks_actions,
  get_tasks_table_actions,
  patch_task_actions,
  get_available_tags_actions
} from '@core/tasks/actions'
import { post_user_session_request_actions } from '@core/app/actions'
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
import {
  get_git_status_all_actions,
  get_git_status_actions,
  get_git_diff_actions,
  get_file_at_ref_actions,
  get_file_content_actions,
  stage_files_actions,
  unstage_files_actions,
  discard_files_actions,
  commit_changes_actions,
  pull_changes_actions,
  push_changes_actions,
  get_conflicts_actions,
  resolve_conflict_actions,
  get_conflict_versions_actions,
  abort_merge_actions,
  generate_commit_message_actions,
  get_repo_info_actions
} from '@core/git/actions'
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

export const post_user_session = fetch.bind(
  null,
  api.post_user_session,
  post_user_session_request_actions
)
export const get_tasks = fetch.bind(null, api.get_tasks, get_tasks_actions)
export const patch_task = fetch.bind(null, api.patch_task, patch_task_actions)
export const get_available_tags = fetch.bind(
  null,
  api.get_available_tags,
  get_available_tags_actions
)

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

// Git operations
export const get_git_status_all = fetch.bind(
  null,
  api.get_git_status_all,
  get_git_status_all_actions
)

export const get_git_status = fetch.bind(
  null,
  api.get_git_status,
  get_git_status_actions
)

export const get_git_diff = fetch.bind(
  null,
  api.get_git_diff,
  get_git_diff_actions
)

export const get_file_at_ref = fetch.bind(
  null,
  api.get_file_at_ref,
  get_file_at_ref_actions
)

export const get_git_file_content = fetch.bind(
  null,
  api.get_git_file_content,
  get_file_content_actions
)

export const stage_files = fetch.bind(
  null,
  api.stage_files,
  stage_files_actions
)

export const unstage_files = fetch.bind(
  null,
  api.unstage_files,
  unstage_files_actions
)

export const discard_files = fetch.bind(
  null,
  api.discard_files,
  discard_files_actions
)

export const commit_changes = fetch.bind(
  null,
  api.commit_changes,
  commit_changes_actions
)

export const pull_changes = fetch.bind(
  null,
  api.pull_changes,
  pull_changes_actions
)

export const push_changes = fetch.bind(
  null,
  api.push_changes,
  push_changes_actions
)

export const get_conflicts = fetch.bind(
  null,
  api.get_conflicts,
  get_conflicts_actions
)

export const resolve_conflict = fetch.bind(
  null,
  api.resolve_conflict,
  resolve_conflict_actions
)

export const get_conflict_versions = fetch.bind(
  null,
  api.get_conflict_versions,
  get_conflict_versions_actions
)

export const abort_merge = fetch.bind(
  null,
  api.abort_merge,
  abort_merge_actions
)

export const generate_commit_message = fetch.bind(
  null,
  api.generate_commit_message,
  generate_commit_message_actions
)

export const get_repo_info = fetch.bind(
  null,
  api.get_repo_info,
  get_repo_info_actions
)
