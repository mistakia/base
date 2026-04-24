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
  get_search_query,
  get_active_types,
  get_active_tags,
  get_active_statuses,
  get_active_sources,
  get_active_path
} from './selectors.js'
import { api, api_request } from '@core/api/service.js'
import { get_app } from '@core/app/selectors.js'

function* handle_search_query({ payload }) {
  const { query, source, type, tag, status, path_glob, limit, offset } =
    payload

  const has_filters = Boolean(source || type || tag || status || path_glob)

  if ((!query || query.trim().length < 2) && !has_filters) {
    yield put(
      search_actions.search_success({ query: '', total: 0, results: [] })
    )
    return
  }

  try {
    const params = { q: query }
    if (source) params.source = source
    if (type) params.type = type
    if (tag) params.tag = tag
    if (status) params.status = status
    if (path_glob) params.path_glob = path_glob
    if (limit) params.limit = limit
    if (offset) params.offset = offset

    const app = yield select(get_app)
    const token = app.get('user_token')
    const { request } = api_request(api.search, params, token)
    const data = yield call(request)

    yield put(search_actions.search_success(data))
  } catch (error) {
    yield put(search_actions.search_failure(error.message))
  }
}

function* handle_query_change() {
  const current_query = yield select(get_search_query)
  const active_types = yield select(get_active_types)
  const active_tags = yield select(get_active_tags)
  const active_statuses = yield select(get_active_statuses)
  const active_sources = yield select(get_active_sources)
  const active_path = yield select(get_active_path)

  const has_filters =
    active_types.length > 0 ||
    active_tags.length > 0 ||
    active_statuses.length > 0 ||
    active_sources.length > 0 ||
    Boolean(active_path)

  if ((current_query && current_query.trim().length >= 2) || has_filters) {
    const search_payload = { query: current_query || '' }
    if (active_types.length > 0) search_payload.type = active_types.join(',')
    if (active_tags.length > 0) search_payload.tag = active_tags.join(',')
    if (active_statuses.length > 0)
      search_payload.status = active_statuses.join(',')
    if (active_sources.length > 0)
      search_payload.source = active_sources.join(',')
    if (active_path) search_payload.path_glob = active_path
    yield put(search_actions.search(search_payload))
  } else {
    yield put(search_actions.clear_results())
  }
}

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

function* handle_palette_open() {
  const recent_files_loaded = yield select(get_recent_files_loaded)
  const recent_files_loading = yield select(get_recent_files_loading)

  if (!recent_files_loaded && !recent_files_loading) {
    yield put(search_actions.fetch_recent_files())
  }
}

const encode_path = (p) =>
  p
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')

function navigation_url_for(result) {
  if (!result) return null

  // Flat search result — navigate by entity_uri. Threads go to the thread
  // route; everything else resolves to its on-disk path under user:/sys:.
  if (result.entity_uri) {
    if (result.entity_uri.startsWith('user:thread/')) {
      const thread_id = result.entity_uri.slice('user:thread/'.length)
      return `/thread/${thread_id}`
    }
    const entity_path = result.entity_uri.replace(/^(?:user|sys):/, '')
    return `/${encode_path(entity_path)}`
  }

  // Recent files retain the legacy shape with relative_path / file_path.
  const fallback_path = result.relative_path || result.file_path
  if (fallback_path) return `/${encode_path(fallback_path)}`

  return null
}

export function* navigate_to_result() {
  const results = yield select(get_all_results_flat)
  const selected_index = yield select(get_selected_index)
  const selected = results.get(selected_index)

  const url = navigation_url_for(selected)
  if (!url) return

  yield put(search_actions.close())
  yield put(push(url))
}

export function* watch_search_query_change() {
  yield debounce(300, search_action_types.SET_SEARCH_QUERY, handle_query_change)
}

export function* watch_chip_removal() {
  yield takeLatest(search_action_types.REMOVE_CHIP, handle_query_change)
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

export const search_sagas = [
  fork(watch_search_query_change),
  fork(watch_chip_removal),
  fork(watch_search_request),
  fork(watch_palette_open),
  fork(watch_fetch_recent_files)
]
