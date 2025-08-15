import { takeLatest, fork, call, put, select } from 'redux-saga/effects'

import {
  get_directories,
  get_file_content,
  get_path_info
} from '@core/api/sagas'
import { api, api_request } from '@core/api/service'
import {
  directory_action_types,
  get_directory_markdown_request_actions
} from './actions'
import { get_app } from '@core/app/selectors'

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

  yield put(get_directory_markdown_request_actions.pending({ opts: payload }))

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

export const directory_sagas = [
  fork(watch_load_directory),
  fork(watch_load_file),
  fork(watch_load_path_info),
  fork(watch_load_directory_markdown)
]
