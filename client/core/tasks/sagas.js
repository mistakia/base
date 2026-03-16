import {
  takeLatest,
  fork,
  call,
  select,
  debounce,
  put
} from 'redux-saga/effects'

import {
  get_tasks,
  get_tasks_table,
  patch_task,
  get_available_tags,
  post_entity_tags
} from '@core/api/sagas'
import { tasks_action_types, tasks_actions } from './actions'
import { get_tasks_state } from './selectors'
import { get_app } from '@core/app/selectors'

export function* load_tasks({ payload }) {
  yield call(get_tasks, payload)
}

export function* load_tasks_table_data({ payload }) {
  try {
    const tasks_state = yield select(get_tasks_state)
    const {
      view_id,
      is_append = false,
      url_filters = [],
      url_sort = null
    } = payload || {}

    // Use provided view_id or get selected view from state, defaulting to 'open'
    const resolved_view_id =
      view_id || tasks_state.get('selected_task_table_view_id') || 'open'

    // Use current table state from the specified view
    const selected_view = tasks_state.getIn([
      'task_table_views',
      resolved_view_id
    ])

    // When url params are provided, start from saved_table_state (the view's
    // default) so we get a clean merge. When no url params, also use
    // saved_table_state to reset any previously applied URL overrides.
    const has_url_params = url_filters.length > 0 || url_sort
    const base_state = has_url_params
      ? selected_view.get('saved_table_state')
      : selected_view.get('task_table_state')
    let table_state = base_state?.toJS ? base_state.toJS() : base_state

    // Merge url_filters with saved table state filters
    if (url_filters.length > 0) {
      const existing_where = table_state.where || []
      // Filter out any existing filters for the same columns (url takes priority)
      const url_filter_columns = new Set(url_filters.map((f) => f.column_id))
      const filtered_existing = existing_where.filter(
        (f) => !url_filter_columns.has(f.column_id)
      )
      table_state = {
        ...table_state,
        where: [...filtered_existing, ...url_filters]
      }
    }

    // Override sort when url_sort is provided
    if (url_sort) {
      table_state = {
        ...table_state,
        sort: url_sort
      }
    }

    // Persist merged state to Redux so the Table UI reflects URL overrides
    if (has_url_params) {
      yield put(
        tasks_actions.set_task_table_state({
          view_id: resolved_view_id,
          table_state
        })
      )
    }

    // For append requests, adjust offset based on current rows fetched
    if (is_append) {
      const task_total_rows_fetched = selected_view.get(
        'task_total_rows_fetched'
      )
      table_state = {
        ...table_state,
        offset: task_total_rows_fetched
      }
    }

    yield call(get_tasks_table, {
      table_state,
      is_append,
      view_id: resolved_view_id
    })
  } catch (error) {
    console.error('Error loading tasks table data:', error)
  }
}

export function* debounced_table_state_fetch({ payload }) {
  try {
    // Get the view from payload or use selected view
    const tasks_state = yield select(get_tasks_state)
    const { view } = payload
    const view_id =
      view?.view_id || tasks_state.get('selected_task_table_view_id') || 'open'
    const selected_view = tasks_state.getIn(['task_table_views', view_id])

    // Use table_state from the view object if provided, otherwise from selected_view
    const table_state =
      view?.table_state || selected_view.get('task_table_state')
    let serialized_state = table_state?.toJS ? table_state.toJS() : table_state

    // Ensure table_state has limit and offset, with defaults
    if (!serialized_state.limit) {
      serialized_state = { ...serialized_state, limit: 1000 }
    }
    if (!serialized_state.offset) {
      serialized_state = { ...serialized_state, offset: 0 }
    }

    yield call(get_tasks_table, {
      table_state: serialized_state,
      is_append: false,
      view_id
    })
  } catch (error) {
    console.error('Error in debounced table state fetch:', error)
  }
}

export function* update_task_property({ payload }) {
  const { base_uri, property_name, value, previous_value } = payload

  // Call the API to update the task
  // Pass previous_value in opts so it's available in PATCH_TASK_FAILED for revert
  yield call(patch_task, {
    base_uri,
    properties: { [property_name]: value },
    // These are passed through opts and available in the failed action payload
    property_name,
    previous_value
  })
}

export function* handle_patch_task_failed({ payload }) {
  const { opts } = payload
  const { base_uri, property_name, previous_value } = opts || {}

  // Revert the optimistic update using the previous value from opts
  if (previous_value !== undefined && base_uri && property_name) {
    yield put(
      tasks_actions.revert_task_update({
        base_uri,
        property_name,
        previous_value
      })
    )
  }
}

export function* load_available_tags({ payload } = {}) {
  const app = yield select(get_app)
  if (!app.get('user_token')) return
  const { used_by } = payload
  yield call(get_available_tags, { used_by })
}

export function* handle_add_entity_tag({ payload }) {
  const { base_uri, tag_base_uri } = payload
  yield call(post_entity_tags, {
    base_uri,
    tags_to_add: [tag_base_uri]
  })
}

export function* handle_remove_entity_tag({ payload }) {
  const { base_uri, tag_base_uri } = payload
  yield call(post_entity_tags, {
    base_uri,
    tags_to_remove: [tag_base_uri]
  })
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_tasks() {
  yield takeLatest(tasks_action_types.LOAD_TASKS, load_tasks)
}

export function* watch_update_task_property() {
  yield takeLatest(
    tasks_action_types.UPDATE_TASK_PROPERTY,
    update_task_property
  )
}

export function* watch_patch_task_failed() {
  yield takeLatest(
    tasks_action_types.PATCH_TASK_FAILED,
    handle_patch_task_failed
  )
}

// Table view management watchers
export function* watch_update_task_table_view() {
  // Debounce table view changes by 300ms to prevent excessive server calls
  yield debounce(
    300,
    tasks_action_types.UPDATE_TASK_TABLE_VIEW,
    debounced_table_state_fetch
  )
}

export function* watch_load_tasks_table() {
  yield takeLatest(tasks_action_types.LOAD_TASKS_TABLE, load_tasks_table_data)
}

export function* watch_load_available_tags() {
  yield takeLatest(tasks_action_types.LOAD_AVAILABLE_TAGS, load_available_tags)
}

export function* watch_add_entity_tag() {
  yield takeLatest(tasks_action_types.ADD_ENTITY_TAG, handle_add_entity_tag)
}

export function* watch_remove_entity_tag() {
  yield takeLatest(
    tasks_action_types.REMOVE_ENTITY_TAG,
    handle_remove_entity_tag
  )
}

//= ====================================
//  ROOT
// -------------------------------------

export const tasks_sagas = [
  fork(watch_load_tasks),
  fork(watch_update_task_table_view),
  fork(watch_load_tasks_table),
  fork(watch_update_task_property),
  fork(watch_patch_task_failed),
  fork(watch_load_available_tags),
  fork(watch_add_entity_tag),
  fork(watch_remove_entity_tag)
]
