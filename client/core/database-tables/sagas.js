import { Map, List } from 'immutable'
import { call, takeLatest, fork, select, put } from 'redux-saga/effects'

import { get_app, app_actions } from '@core/app'
import { get_database, get_database_items } from '@core/api'
import {
  path_view_actions,
  get_selected_path_view,
  get_selected_path_views
} from '@core/path-views'
import { database_table_actions } from './actions'

export function* load_database({ payload }) {
  yield call(get_database, payload)
}

export function* load_database_items() {
  const { selected_path } = yield select(get_app)
  const { user_id, database_table_name } = selected_path
  const selected_path_view = yield select(get_selected_path_view)
  const table_state = selected_path_view.get('table_state', new Map())
  const params = table_state.toJS()
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

export function* set_database_default_view({ payload }) {
  const { selected_path } = yield select(get_app)

  if (
    selected_path.database_table_name ===
      payload.data.database_table.table_name &&
    payload.data.database_table_views.length === 0
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
      view_name: 'Default',
      view_description: `default generated view for ${payload.data.database_table.table_name} table showing all columns and no filters`,
      table_name: payload.data.database_table.table_name,
      table_state: new Map({
        columns,
        sorting: []
      }),
      all_columns: new List(payload.data.database_table_columns)
    }
    yield put(path_view_actions.create_path_view(default_path_view))
  }

  const views = yield select(get_selected_path_views)
  const first_view = views.first()

  if (first_view) {
    // set selected view to default view
    yield put(
      app_actions.set_selected_path_view_id({
        view_id: first_view.get('view_id')
      })
    )

    // load database items
    yield call(load_database_items)
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
