import {
  takeLatest,
  fork,
  call,
  select,
  debounce,
  put
} from 'redux-saga/effects'

import {
  get_physical_items_table,
  get_available_tags
} from '@core/api/sagas'
import { physical_items_action_types, physical_items_actions } from './actions'
import { get_physical_items_state } from './selectors'
import { get_app } from '@core/app/selectors'

export function* load_physical_items_table_data({ payload }) {
  try {
    const physical_items_state = yield select(get_physical_items_state)
    const {
      view_id,
      is_append = false,
      url_filters = [],
      url_sort = null
    } = payload || {}

    const resolved_view_id =
      view_id ||
      physical_items_state.get('selected_physical_item_table_view_id') ||
      'default'

    const selected_view = physical_items_state.getIn([
      'physical_item_table_views',
      resolved_view_id
    ])

    const has_url_params = url_filters.length > 0 || url_sort
    const base_state = has_url_params
      ? selected_view.get('saved_table_state')
      : selected_view.get('physical_item_table_state')
    let table_state = base_state?.toJS ? base_state.toJS() : base_state

    if (url_filters.length > 0) {
      const existing_where = table_state.where || []
      const url_filter_columns = new Set(url_filters.map((f) => f.column_id))
      const filtered_existing = existing_where.filter(
        (f) => !url_filter_columns.has(f.column_id)
      )
      table_state = {
        ...table_state,
        where: [...filtered_existing, ...url_filters]
      }
    }

    if (url_sort) {
      table_state = {
        ...table_state,
        sort: url_sort
      }
    }

    if (has_url_params) {
      yield put(
        physical_items_actions.set_physical_item_table_state({
          view_id: resolved_view_id,
          table_state
        })
      )
    }

    if (is_append) {
      const total_rows_fetched = selected_view.get(
        'physical_item_total_rows_fetched'
      )
      table_state = {
        ...table_state,
        offset: total_rows_fetched
      }
    }

    yield call(get_physical_items_table, {
      table_state,
      is_append,
      view_id: resolved_view_id
    })
  } catch (error) {
    console.error('Error loading physical items table data:', error)
  }
}

export function* debounced_table_state_fetch({ payload }) {
  try {
    const physical_items_state = yield select(get_physical_items_state)
    const { view } = payload
    const view_id =
      view?.view_id ||
      physical_items_state.get('selected_physical_item_table_view_id') ||
      'default'
    const selected_view = physical_items_state.getIn([
      'physical_item_table_views',
      view_id
    ])

    const table_state =
      view?.table_state || selected_view.get('physical_item_table_state')
    let serialized_state = table_state?.toJS ? table_state.toJS() : table_state

    if (!serialized_state.limit) {
      serialized_state = { ...serialized_state, limit: 1000 }
    }
    if (!serialized_state.offset) {
      serialized_state = { ...serialized_state, offset: 0 }
    }

    yield call(get_physical_items_table, {
      table_state: serialized_state,
      is_append: false,
      view_id
    })
  } catch (error) {
    console.error('Error in debounced table state fetch:', error)
  }
}

export function* load_available_tags({ payload } = {}) {
  const app = yield select(get_app)
  if (!app.get('user_token')) return
  const { used_by } = payload
  yield call(get_available_tags, { used_by })
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_update_physical_item_table_view() {
  yield debounce(
    300,
    physical_items_action_types.UPDATE_PHYSICAL_ITEM_TABLE_VIEW,
    debounced_table_state_fetch
  )
}

export function* watch_load_physical_items_table() {
  yield takeLatest(
    physical_items_action_types.LOAD_PHYSICAL_ITEMS_TABLE,
    load_physical_items_table_data
  )
}

export function* watch_load_available_tags() {
  yield takeLatest(
    physical_items_action_types.LOAD_AVAILABLE_TAGS,
    load_available_tags
  )
}

//= ====================================
//  ROOT
// -------------------------------------

export const physical_items_sagas = [
  fork(watch_update_physical_item_table_view),
  fork(watch_load_physical_items_table),
  fork(watch_load_available_tags)
]
