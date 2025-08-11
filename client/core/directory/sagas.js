import { takeLatest, fork, call } from 'redux-saga/effects'

import {
  get_directories,
  get_file_content,
  get_path_info
} from '@core/api/sagas'
import { directory_action_types } from './actions'

export function* load_directory({ payload }) {
  yield call(get_directories, { path: payload?.path })
}

export function* load_file({ payload }) {
  yield call(get_file_content, { path: payload?.path })
}

export function* load_path_info({ payload }) {
  yield call(get_path_info, { path: payload?.path })
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

export const directory_sagas = [
  fork(watch_load_directory),
  fork(watch_load_file),
  fork(watch_load_path_info)
]
