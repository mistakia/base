import {
  takeLatest,
  takeEvery,
  fork,
  call,
  put,
  select
} from 'redux-saga/effects'

import {
  get_directories,
  get_file_content,
  get_path_info
} from '@core/api/sagas'
import { api, api_request } from '@core/api/service'
import { normalize_file_path } from '#libs-shared/path-utils.mjs'
import {
  directory_action_types,
  directory_actions,
  get_directory_markdown_request_actions
} from './actions'
import { get_app } from '@core/app/selectors'
import { get_current_file_path, get_directory_state } from './selectors'

export function* load_directory({ payload }) {
  yield call(get_directories, { path: payload?.path })
  yield put({ type: directory_action_types.LOAD_DIRECTORY_MARKDOWN, payload })
}

export function* load_file({ payload }) {
  yield call(get_file_content, { path: payload?.path })
}

export function* load_path_info({ payload }) {
  yield call(get_path_info, { path: payload?.path })
}

export function* load_directory_markdown({ payload }) {
  const markdown_files = ['ABOUT.md', 'README.md', 'INDEX.md']

  // Skip re-fetch if markdown is already loaded for this path
  const directory_state = yield select(get_directory_state)
  const existing = directory_state.get('directory_markdown_file')
  const requested_path = payload?.path || ''
  if (existing && !directory_state.get('directory_markdown_error')) {
    const existing_dir =
      existing._directory !== undefined
        ? existing._directory
        : (existing.path || '').substring(
            0,
            (existing.path || '').lastIndexOf('/')
          )
    if (existing_dir === requested_path || (!existing_dir && !requested_path)) {
      return
    }
  }

  yield put(get_directory_markdown_request_actions.pending({ opts: payload }))

  // For root directory, use the homepage content endpoint
  if (!requested_path) {
    try {
      const { user_token } = yield select(get_app)
      const { request } = api_request(
        api.get_homepage_content,
        {},
        user_token
      )

      const file_data = yield call(request)

      if (file_data && file_data.content) {
        yield put(
          get_directory_markdown_request_actions.fulfilled({
            opts: payload,
            data: { ...file_data, _directory: '' }
          })
        )
        return
      }
    } catch (error) {
      // Fall through to standard file lookup
    }
  }

  for (const filename of markdown_files) {
    const markdown_path = payload?.path
      ? `${payload.path}/${filename}`
      : filename

    try {
      // Directly use API service instead of saga to avoid state conflicts
      const { user_token } = yield select(get_app)
      const { request } = api_request(
        api.get_file_content,
        { path: markdown_path },
        user_token
      )

      const file_data = yield call(request)

      if (file_data && file_data.content) {
        yield put(
          get_directory_markdown_request_actions.fulfilled({
            opts: payload,
            data: file_data
          })
        )
        return
      }
    } catch (error) {
      // File not found is expected, continue to next file
      continue
    }
  }

  // No markdown files found
  yield put(
    get_directory_markdown_request_actions.fulfilled({
      opts: payload,
      data: { content: null }
    })
  )
}

export function* watch_load_directory() {
  yield takeLatest(directory_action_types.LOAD_DIRECTORY, load_directory)
}

export function* watch_load_file() {
  yield takeLatest(directory_action_types.LOAD_FILE, load_file)
}

export function* watch_load_path_info() {
  yield takeLatest(directory_action_types.LOAD_PATH_INFO, load_path_info)
}

export function* watch_load_directory_markdown() {
  yield takeLatest(
    directory_action_types.LOAD_DIRECTORY_MARKDOWN,
    load_directory_markdown
  )
}

/**
 * Check if an event path matches the currently viewed file
 * @param {string} event_path - Path from the WebSocket event
 * @returns {string|null} The normalized current path if it matches, null otherwise
 */
function* get_matching_current_path(event_path) {
  const normalized_event_path = normalize_file_path(event_path)
  if (!normalized_event_path) return null

  const current_path = yield select(get_current_file_path)
  const normalized_current = normalize_file_path(current_path)

  return normalized_event_path === normalized_current
    ? normalized_current
    : null
}

/**
 * Handle FILE_CHANGED events from WebSocket
 * If the changed file matches the currently viewed file, trigger a refetch
 */
export function* handle_file_changed({ payload }) {
  const matching_path = yield* get_matching_current_path(payload?.path)
  if (matching_path) {
    yield put(directory_actions.load_file(matching_path))
  }
}

/**
 * Handle FILE_DELETED events from WebSocket
 * If the deleted file matches the currently viewed file, clear the file data
 */
export function* handle_file_deleted({ payload }) {
  const matching_path = yield* get_matching_current_path(payload?.path)
  if (matching_path) {
    yield put({
      type: directory_action_types.GET_FILE_CONTENT_FAILED,
      payload: { error: 'File has been deleted' }
    })
  }
}

export function* watch_file_changed() {
  yield takeEvery(directory_action_types.FILE_CHANGED, handle_file_changed)
}

export function* watch_file_deleted() {
  yield takeEvery(directory_action_types.FILE_DELETED, handle_file_deleted)
}

export const directory_sagas = [
  fork(watch_load_directory),
  fork(watch_load_file),
  fork(watch_load_path_info),
  fork(watch_load_directory_markdown),
  fork(watch_file_changed),
  fork(watch_file_deleted)
]
