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
import {
  get_all_results_flat,
  get_selected_index,
  get_recent_files_loaded,
  get_recent_files_loading,
  get_search_mode,
  get_stripped_query
} from './selectors.js'
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
function* handle_query_change() {
  const search_mode = yield select(get_search_mode)
  const stripped_query = yield select(get_stripped_query)

  if (stripped_query && stripped_query.trim().length >= 2) {
    const api_mode = search_mode === 'default' ? 'full' : search_mode
    yield put(search_actions.search({ query: stripped_query, mode: api_mode }))
  } else {
    yield put(search_actions.clear_results())
  }
}

// Fetch recent files when palette opens
function* handle_fetch_recent_files() {
  try {
    const app = yield select(get_app)
    const token = app.get('user_token')
    const { request } = api_request(api.get_recent_files, {}, token)
    const data = yield call(request)

    yield put(search_actions.fetch_recent_files_success(data.results || []))
  } catch (error) {
    yield put(search_actions.fetch_recent_files_failure(error.message))
  }
}

// Handle palette open - fetch recent files if not loaded or loading
function* handle_palette_open() {
  const recent_files_loaded = yield select(get_recent_files_loaded)
  const recent_files_loading = yield select(get_recent_files_loading)

  if (!recent_files_loaded && !recent_files_loading) {
    yield put(search_actions.fetch_recent_files())
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

  // Encode path segments individually to preserve slashes
  const encode_path = (p) =>
    p
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/')

  // Navigate based on result type
  if (selected.category === 'thread') {
    yield put(push(`/thread/${selected.thread_id}`))
  } else if (selected.category === 'semantic' && selected.base_uri) {
    const entity_path = selected.base_uri.replace(/^user:/, '')
    yield put(push(`/${encode_path(entity_path)}`))
  } else if (selected.category === 'content' && selected.relative_path) {
    const line_suffix = selected.line_number ? `#L${selected.line_number}` : ''
    yield put(push(`/${encode_path(selected.relative_path)}${line_suffix}`))
  } else if (selected.file_path) {
    yield put(push(`/${encode_path(selected.file_path)}`))
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

export function* watch_palette_open() {
  yield takeLatest(
    search_action_types.OPEN_COMMAND_PALETTE,
    handle_palette_open
  )
}

export function* watch_fetch_recent_files() {
  yield takeLatest(
    search_action_types.FETCH_RECENT_FILES_REQUEST,
    handle_fetch_recent_files
  )
}

// ============================================================================
// Root Saga Export
// ============================================================================

export const search_sagas = [
  fork(watch_search_query_change),
  fork(watch_search_request),
  fork(watch_palette_open),
  fork(watch_fetch_recent_files)
]
