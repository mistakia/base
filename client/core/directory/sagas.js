import { call, takeEvery, fork, put, select } from 'redux-saga/effects'

import { get_directories, get_file_content } from '@core/api/sagas'
import { directories_actions } from './actions'
import { get_expanded_directories } from './selectors'

export function* load_directories({ payload }) {
  const { type, path } = payload
  yield call(get_directories, { type, path })
}

export function* load_file_content({ payload }) {
  const { type, path } = payload
  yield call(get_file_content, { type, path })
}

export function* toggle_directory({ payload }) {
  const { type, path } = payload
  const cache_key = `${type}:${path}`
  const expanded_directories = yield select(get_expanded_directories)

  // Check if we're expanding (before the toggle)
  const is_expanding = expanded_directories.has(cache_key)

  // If we're expanding and don't have subdirectories cached, load them
  if (is_expanding) {
    yield put(directories_actions.load_directories({ type, path }))
  }
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_directories() {
  yield takeEvery(directories_actions.LOAD_DIRECTORIES, load_directories)
}

export function* watch_load_file_content() {
  yield takeEvery(directories_actions.LOAD_FILE_CONTENT, load_file_content)
}

export function* watch_toggle_directory() {
  yield takeEvery(directories_actions.TOGGLE_DIRECTORY, toggle_directory)
}

//= ====================================
//  ROOT
// -------------------------------------

export const directory_sagas = [
  fork(watch_load_directories),
  fork(watch_load_file_content),
  fork(watch_toggle_directory)
]
