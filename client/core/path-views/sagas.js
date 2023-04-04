import { call, fork, takeLatest, select } from 'redux-saga/effects'

import { path_view_actions } from './actions'
import { get_app } from '@core/app'
import { put_database_view, post_database_views } from '@core/api'

export function* save_view({ payload }) {
  const { view_id } = payload
  const { user_id } = yield select(get_app)
  const view = yield select((state) => state.getIn(['path_views', view_id]))

  const view_id_exists = !view_id.includes('DEFAULT')
  const params = {
    view_name: view.get('view_name'),
    view_description: view.get('view_description'),
    table_state: view.get('table_state').toJS(),
    table_name: view.get('table_name'),
    user_id
  }
  if (view_id_exists) {
    params.view_id = view_id
    yield call(put_database_view, params)
  } else {
    yield call(post_database_views, params)
  }
}

//= ====================================
// WATCHERS
// -------------------------------------

export function* watch_set_database_view_table_state() {
  yield takeLatest(path_view_actions.SET_DATABASE_VIEW_TABLE_STATE, save_view)
}

//= ====================================
// ROOT
// -------------------------------------

export const path_views_sagas = [fork(watch_set_database_view_table_state)]
