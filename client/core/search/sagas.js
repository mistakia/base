import {
  call,
  put,
  takeLatest,
  debounce,
  select,
  fork
} from 'redux-saga/effects'
import { push } from 'redux-first-history'

import { search_action_types, search_actions } from './actions.js'
import { get_all_results_flat, get_selected_index } from './selectors.js'
import { api, api_request } from '@core/api/service.js'
import { get_app } from '@core/app/selectors.js'

// Debounced search saga
function* handle_search_query({ payload }) {
  const { query, mode = 'full', types, limit } = payload

  if (!query || query.trim().length < 2) {
    yield put(
      search_actions.search_success({
        files: [],
        threads: [],
        entities: [],
        total: 0
      })
    )
    return
  }

  try {
    const params = { q: query, mode }
    if (types) params.types = types.join(',')
    if (limit) params.limit = limit

    const app = yield select(get_app)
    const token = app.get('user_token')
    const { request } = api_request(api.search, params, token)
    const data = yield call(request)

    yield put(search_actions.search_success(data))
  } catch (error) {
    yield put(search_actions.search_failure(error.message))
  }
}

// Handle query change with debounce
function* handle_query_change({ payload }) {
  const { query } = payload

  if (query && query.trim().length >= 2) {
    yield put(search_actions.search({ query, mode: 'full' }))
  } else {
    yield put(
      search_actions.search_success({
        files: [],
        threads: [],
        entities: [],
        total: 0
      })
    )
  }
}

// Navigate to selected result
export function* navigate_to_result() {
  const results = yield select(get_all_results_flat)
  const selected_index = yield select(get_selected_index)
  const selected = results.get(selected_index)

  if (!selected) return

  // Close palette
  yield put(search_actions.close())

  // Navigate based on result type
  if (selected.category === 'thread') {
    yield put(push(`/thread/${selected.thread_id}`))
  } else if (selected.file_path) {
    // Navigate to file view
    yield put(push(`/file/${encodeURIComponent(selected.file_path)}`))
  }
}

// ============================================================================
// Watchers
// ============================================================================

export function* watch_search_query_change() {
  yield debounce(300, search_action_types.SET_SEARCH_QUERY, handle_query_change)
}

export function* watch_search_request() {
  yield takeLatest(search_action_types.SEARCH_REQUEST, handle_search_query)
}

// ============================================================================
// Root Saga Export
// ============================================================================

export const search_sagas = [
  fork(watch_search_query_change),
  fork(watch_search_request)
]
