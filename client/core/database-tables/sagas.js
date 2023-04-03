import { Map, List } from 'immutable'
import { call, takeLatest, fork, select, put } from 'redux-saga/effects'

import { get_app, app_actions } from '@core/app'
import { get_database } from '@core/api'
import { path_view_actions } from '@core/path-views'
import { database_table_actions } from './actions'

export function* load_database({ payload }) {
  yield call(get_database, payload)
}

export function* set_database_default_view({ payload }) {
  const { selected_path } = yield select(get_app)

  if (
    selected_path.database_table_name === payload.data.database_table.table_name
  ) {
    // create default view for database
    const columns = payload.data.database_table_columns.map((column) => ({
      accessorKey: column.column_name,
      header_label: column.column_name,
      column_name: column.column_name,
      table_name: column.table_name,
      data_type: column.data_type
    }))

    const default_path_view = {
      view_id: `${payload.data.database_table.table_id}_VIEW`,
      table_state: new Map({
        columns,
        sorting: []
      }),
      all_columns: new List(payload.data.database_table_columns)
    }
    yield put(path_view_actions.create_path_view(default_path_view))

    // set selected view to default view
    yield put(
      app_actions.set_selected_path_view_id({
        view_id: default_path_view.view_id
      })
    )
  }
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_database() {
  yield takeLatest(database_table_actions.LOAD_DATABASE, load_database)
}

export function* watch_get_database_fulfilled() {
  yield takeLatest(
    database_table_actions.GET_DATABASE_FULFILLED,
    set_database_default_view
  )
}

//= ====================================
//  ROOT
// -------------------------------------

export const database_sagas = [
  fork(watch_load_database),
  fork(watch_get_database_fulfilled)
]
