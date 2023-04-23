import { Map } from 'immutable'
import { call, takeLatest, fork, select } from 'redux-saga/effects'

import { path_view_actions } from './actions'
import { get_app } from '@core/app'
import { post_database_view, delete_database_view } from '@core/api'
import { database_table_actions } from '@core/database-tables/actions'

export function* save_view({ payload }) {
  const { view_id, view_name, view_description, table_state, table_name } =
    payload
  const { user_id } = yield select(get_app)
  const params = {
    view_id,
    view_name,
    view_description,
    table_state,
    table_name,
    user_id
  }

  yield call(post_database_view, params)
}

export function* delete_view({ payload }) {
  const { view_id } = payload
  const view = yield select((state) => state.getIn(['path_views', view_id]))
  const { user_id } = yield select(get_app)
  const params = {
    view_id,
    user_id,
    table_name: view.get('table_name')
  }

  yield call(delete_database_view, params)
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
    const { user_id } = yield select(get_app)

    const default_path_view = {
      user_id,
      view_name: 'Default',
      view_description: `default generated view for ${payload.data.database_table.table_name} table showing all columns and no filters`,
      table_name: payload.data.database_table.table_name,
      table_state: new Map({
        columns,
        sorting: [],
        where: []
      })
    }
    yield call(post_database_view, default_path_view)
  }
}

//= ====================================
// WATCHERS
// -------------------------------------

export function* watch_set_database_view() {
  yield takeLatest(path_view_actions.SET_DATABASE_VIEW, save_view)
}

export function* watch_get_database_fulfilled() {
  yield takeLatest(
    database_table_actions.GET_DATABASE_FULFILLED,
    set_database_default_view
  )
}

export function* wacth_delete_database_view() {
  yield takeLatest(path_view_actions.DELETE_DATABASE_VIEW, delete_view)
}

//= ====================================
// ROOT
// -------------------------------------

export const path_views_sagas = [
  fork(watch_set_database_view),
  fork(watch_get_database_fulfilled),
  fork(wacth_delete_database_view)
]
