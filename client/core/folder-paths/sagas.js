import { call, fork, takeLatest } from 'redux-saga/effects'

import { folder_path_actions } from './actions'
import { get_folder_path } from '@core/api'

export function* load_folder_path({ payload }) {
  yield call(get_folder_path, payload)
}

//= ====================================
// WATCHERS
// -------------------------------------

export function* watch_load_folder_path() {
  yield takeLatest(folder_path_actions.LOAD_FOLDER_PATH, load_folder_path)
}

//= ====================================
// ROOT
// -------------------------------------

export const folder_path_sagas = [fork(watch_load_folder_path)]
