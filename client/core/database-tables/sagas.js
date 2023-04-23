import { Map } from 'immutable'
import { call, takeLatest, fork, select } from 'redux-saga/effects'

import { get_app } from '@core/app'
import { get_database, get_database_items } from '@core/api'
import { path_view_actions, get_selected_path_view } from '@core/path-views'
import { database_table_actions } from './actions'

export function* load_database({ payload }) {
  yield call(get_database, payload)
}

export function* load_database_items() {
  const { selected_path } = yield select(get_app)
  const { user_id, database_table_name } = selected_path
  const selected_path_view = yield select(get_selected_path_view)
  const params = selected_path_view.get('table_state', new Map()).toJS()
  if (params.columns) {
    params.columns = params.columns.map(
      ({ column_name, table_name, data_type }) => ({
        column_name,
        table_name,
        data_type
      })
    )
  }
  yield call(get_database_items, { user_id, database_table_name, ...params })
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_database() {
  yield takeLatest(database_table_actions.LOAD_DATABASE, load_database)
}

export function* watch_post_database_view_fulfilled() {
  yield takeLatest(
    path_view_actions.POST_DATABASE_VIEW_FULFILLED,
    load_database_items
  )
}

export function* watch_get_database_fulfilled() {
  yield takeLatest(
    database_table_actions.GET_DATABASE_FULFILLED,
    load_database_items
  )
}

//= ====================================
//  ROOT
// -------------------------------------

export const database_sagas = [
  fork(watch_load_database),
  fork(watch_post_database_view_fulfilled),
  fork(watch_get_database_fulfilled)
]
