import { call, fork, takeLatest } from 'redux-saga/effects'

import { path_view_actions } from './actions'
import { get_path_views } from '@core/api'

export function* load_folder_path({ payload }) {
  yield call(get_path_views, payload)
}

//= ====================================
// WATCHERS
// -------------------------------------

export function* watch_load_folder_path() {
  yield takeLatest(path_view_actions.LOAD_FOLDER_PATH, load_folder_path)
}

//= ====================================
// ROOT
// -------------------------------------

export const path_views_saga = [fork(watch_load_folder_path)]
