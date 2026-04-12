import {
  takeLatest,
  takeEvery,
  fork,
  call,
  select,
  debounce,
  delay,
  put
} from 'redux-saga/effects'

import {
  get_threads,
  get_thread,
  get_models,
  get_threads_table,
  get_threads_available_tags,
  put_thread_state,
  create_thread_session,
  resume_thread_session,
  delete_active_session
} from '@core/api/sagas'
import { threads_action_types, threads_actions } from './actions'
import {
  active_sessions_action_types,
  active_sessions_actions
} from '@core/active-sessions/actions'
import { get_threads_state } from './selectors'
import { get_app } from '@core/app/selectors'
import { get_active_session_for_thread } from '@core/active-sessions/selectors'
import { show_error_notification } from '@core/notification/sagas'
import { dialog_actions } from '@core/dialog/actions'
import { thread_sheet_actions } from '@core/thread-sheet/actions'
import { get_thread_sheet_active_sheet } from '@core/thread-sheet/selectors'

//= ====================================
//  UTILITY SAGAS
//= ====================================

/**
 * Ensures models data is loaded for cost calculations
 */
function* ensure_models_data_loaded() {
  const threads_state = yield select(get_threads_state)
  const models_data = threads_state.getIn(['models_data', 'data'])
  if (!models_data) {
    yield call(get_models)
  }
}

/**
 * Serializes Immutable table state to plain JS object
 */
function serialize_table_state(table_state) {
  return table_state?.toJS ? table_state.toJS() : table_state
}

/**
 * Gets view ID from payload or falls back to selected view or default
 */
function* get_view_id_from_payload(payload) {
  const threads_state = yield select(get_threads_state)
  const { view } = payload
  return (
    view?.view_id ||
    threads_state.get('selected_thread_table_view_id') ||
    'default'
  )
}

//= ====================================
//  THREAD LOADING SAGAS
//= ====================================

export function* load_threads({ payload }) {
  yield call(get_threads, payload)
  yield call(ensure_models_data_loaded)
}

export function* load_thread({ payload }) {
  yield call(get_thread, payload)
  yield call(ensure_models_data_loaded)
}

//= ====================================
//  TABLE VIEW MANAGEMENT SAGAS
//= ====================================

export function* load_threads_table_data({ payload }) {
  try {
    const {
      view_id = 'default',
      is_append = false,
      url_filters = [],
      url_sort = null
    } = payload

    const threads_state = yield select(get_threads_state)
    const selected_view = threads_state.getIn(['thread_table_views', view_id])

    // When url params are provided, start from saved_table_state (the view's
    // default) so we get a clean merge. When no url params, also use
    // saved_table_state to reset any previously applied URL overrides.
    const has_url_params = url_filters.length > 0 || url_sort
    const base_state = has_url_params
      ? selected_view.get('saved_table_state')
      : selected_view.get('thread_table_state')
    let table_state = serialize_table_state(base_state)

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
        threads_actions.set_thread_table_state({
          view_id,
          table_state
        })
      )
    }

    // Adjust offset for append requests based on current rows fetched
    if (is_append) {
      const thread_total_rows_fetched = selected_view.get(
        'thread_total_rows_fetched'
      )
      table_state = {
        ...table_state,
        offset: thread_total_rows_fetched
      }
    }

    yield call(get_threads_table, {
      table_state,
      is_append,
      view_id
    })

    yield call(ensure_models_data_loaded)
  } catch (error) {
    console.error('Error loading threads table data:', error)
  }
}

export function* debounced_table_state_fetch({ payload }) {
  try {
    const view_id = yield call(get_view_id_from_payload, payload)
    const threads_state = yield select(get_threads_state)
    const selected_view = threads_state.getIn(['thread_table_views', view_id])
    const { view } = payload

    // Use table_state from payload view or selected_view
    const table_state =
      view?.table_state || selected_view.get('thread_table_state')
    let serialized_state = serialize_table_state(table_state)

    // Apply defaults for limit and offset
    serialized_state = {
      limit: 1000,
      offset: 0,
      ...serialized_state
    }

    yield call(get_threads_table, {
      table_state: serialized_state,
      is_append: false,
      view_id
    })
  } catch (error) {
    console.error('Error in debounced table state fetch:', error)
  }
}

//= ====================================
//  THREAD STATE MANAGEMENT SAGAS
//= ====================================

export function* set_thread_archive_state_saga({ payload }) {
  try {
    const { thread_id, archive_reason } = payload

    const thread_state = archive_reason ? 'archived' : 'active'

    // When archiving, send archive_reason; when reactivating, no reason needed
    if (thread_state === 'archived') {
      yield call(put_thread_state, {
        thread_id,
        thread_state,
        archive_reason
      })

      // Remove active session if it exists for this thread
      const active_session = yield select(
        get_active_session_for_thread,
        thread_id
      )
      if (active_session?.session_id) {
        // Best effort deletion - update Redux state regardless of API result
        // since session may have already been removed server-side
        yield call(delete_active_session, {
          session_id: active_session.session_id
        })
        // Remove session from active list
        yield put(
          active_sessions_actions.active_session_ended(
            active_session.session_id
          )
        )
      }

      // Close floating thread panel if open for this thread
      const active_sheet = yield select(get_thread_sheet_active_sheet)
      if (active_sheet === thread_id) {
        yield put(thread_sheet_actions.close_thread_sheet(thread_id))
      }
    } else {
      // Reactivating - no reason needed, timeline entry shows state change
      yield call(put_thread_state, {
        thread_id,
        thread_state
      })
    }
    yield put(dialog_actions.cancel())
    // No get_thread call needed. The PUT response dispatches
    // PUT_THREAD_STATE_FULFILLED which the threads reducer handles
    // to update the basic list. A separate get_thread races with
    // the server-side index rebuild and can return stale data.
  } catch (error) {
    console.error('Error setting thread archive state:', error)
  }
}

//= ====================================
//  THREAD SESSION SAGAS
//= ====================================

export function* create_thread_session_saga({ payload }) {
  const { prompt, working_directory } = payload
  yield call(create_thread_session, { prompt, working_directory })
}

export function* resume_thread_session_saga({ payload }) {
  const { thread_id, prompt, working_directory } = payload
  yield call(resume_thread_session, { thread_id, prompt, working_directory })
}

//= ====================================
//  WEBSOCKET EVENT HANDLERS
//= ====================================

//= ====================================
//  JOB QUEUE EVENT HANDLERS
//= ====================================

export function* handle_thread_job_failed({ payload }) {
  try {
    const { thread_id, job_id, error_message } = payload
    console.error(`Job ${job_id} failed:`, error_message)

    const label = thread_id ? `thread ${thread_id}` : `job ${job_id}`
    yield call(show_error_notification, `Session failed for ${label}`)
  } catch (err) {
    console.error('Error handling job failed event:', err)
  }
}

//= ====================================
//  TAG LOADING SAGAS
//= ====================================

export function* load_available_tags({ payload } = {}) {
  const app = yield select(get_app)
  if (!app.get('user_token')) return
  const { used_by } = payload
  yield call(get_threads_available_tags, { used_by })
}

//= ====================================
//  WATCHERS
//= ====================================

// Thread loading watchers
export function* watch_load_threads() {
  yield takeLatest(threads_action_types.LOAD_THREADS, load_threads)
}

export function* watch_load_thread() {
  yield takeLatest(threads_action_types.LOAD_THREAD, load_thread)
}

// Table view watchers
export function* watch_update_thread_table_view() {
  yield debounce(
    300,
    threads_action_types.UPDATE_THREAD_TABLE_VIEW,
    debounced_table_state_fetch
  )
}

export function* watch_load_threads_table() {
  yield takeLatest(
    threads_action_types.LOAD_THREADS_TABLE,
    load_threads_table_data
  )
}

// Thread state watchers
export function* watch_set_thread_archive_state() {
  yield takeLatest(
    threads_action_types.SET_THREAD_ARCHIVE_STATE,
    set_thread_archive_state_saga
  )
}

// Thread session watchers
export function* watch_create_thread_session() {
  yield takeLatest(
    threads_action_types.CREATE_THREAD_SESSION,
    create_thread_session_saga
  )
}

export function* watch_resume_thread_session() {
  yield takeLatest(
    threads_action_types.RESUME_THREAD_SESSION,
    resume_thread_session_saga
  )
}

// Tag loading watchers
export function* watch_load_available_tags() {
  yield takeLatest(
    threads_action_types.LOAD_THREADS_AVAILABLE_TAGS,
    load_available_tags
  )
}

// Job queue event watchers
export function* watch_thread_job_failed() {
  yield takeEvery(
    threads_action_types.THREAD_JOB_FAILED,
    handle_thread_job_failed
  )
}

/**
 * When a session ends, re-fetch thread data for any cached thread that was
 * associated with the session. This is a safety net for missed WebSocket
 * timeline events (FSEvents drops, brief disconnections, atomic rewrite
 * timing). The thread-sheet saga handles its own re-fetch for the active
 * sheet; this saga covers the thread page and any other cached thread view.
 */
export function* handle_session_ended_thread_refetch({ payload }) {
  const { session_id } = payload

  // Find the thread_id for this session from the active-sessions store
  const session = yield select((state) =>
    state.getIn(['active_sessions', 'sessions', session_id])
  )
  const thread_id = session?.get('thread_id')
  if (!thread_id) return

  // Only re-fetch if the thread is in the cache (meaning some view is displaying it)
  const cached = yield select((state) =>
    state.hasIn(['threads', 'thread_cache', thread_id])
  )
  if (!cached) return

  // Skip if the thread-sheet saga will already handle this thread
  const active_sheet = yield select((state) =>
    state.getIn(['thread_sheet', 'active_sheet'])
  )
  if (active_sheet === thread_id) return

  // Delay to allow the SessionEnd sync script to write the final timeline
  yield delay(3000)

  yield call(get_thread, { thread_id })
}

export function* watch_session_ended_thread_refetch() {
  yield takeEvery(
    active_sessions_action_types.ACTIVE_SESSION_ENDED,
    handle_session_ended_thread_refetch
  )
}

//= ====================================
//  ROOT SAGA EXPORT
//= ====================================

export const threads_sagas = [
  // Thread loading
  fork(watch_load_threads),
  fork(watch_load_thread),
  // Table views
  fork(watch_update_thread_table_view),
  fork(watch_load_threads_table),
  // Thread state
  fork(watch_set_thread_archive_state),
  // Thread sessions
  fork(watch_create_thread_session),
  fork(watch_resume_thread_session),
  // Tag loading
  fork(watch_load_available_tags),
  // Job queue events
  fork(watch_thread_job_failed),
  // Session-end safety net re-fetch
  fork(watch_session_ended_thread_refetch)
]
