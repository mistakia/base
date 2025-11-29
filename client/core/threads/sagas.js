import {
  takeLatest,
  takeEvery,
  fork,
  call,
  select,
  debounce,
  put
} from 'redux-saga/effects'

import {
  get_threads,
  get_thread,
  get_models,
  get_threads_table,
  put_thread_state,
  create_thread_session,
  resume_thread_session
} from '@core/api/sagas'
import { threads_action_types } from './actions'
import { get_threads_state } from './selectors'
import { show_success_notification } from '@core/notification/sagas'
import { notification_actions } from '@core/notification/actions'
import { dialog_actions } from '@core/dialog/actions'
import history from '@core/history'
import ThreadCreatedNotification from '@views/components/Notification/ThreadCreatedNotification'
import ThreadEventNotification from '@views/components/Notification/ThreadEventNotification'

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

/**
 * Finds thread metadata by thread_id in loaded threads data
 */
function* get_thread_metadata(thread_id) {
  const threads_state = yield select(get_threads_state)
  const all_threads = threads_state.get('threads_data')

  if (all_threads && all_threads.size > 0) {
    const thread = all_threads.find((t) => t.get('thread_id') === thread_id)
    if (thread) {
      return {
        thread_id,
        thread_title: thread.get('title') || thread.get('thread_id')
      }
    }
  }

  return { thread_id, thread_title: null }
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
    const { view_id = 'default', is_append = false } = payload

    const threads_state = yield select(get_threads_state)
    const selected_view = threads_state.getIn(['thread_table_views', view_id])
    let table_state = serialize_table_state(
      selected_view.get('thread_table_state')
    )

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
    const reason = archive_reason || 'reactivated'

    yield call(put_thread_state, { thread_id, thread_state, reason })
    yield put(dialog_actions.cancel())
    yield call(get_thread, { thread_id })
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

export function* handle_thread_created({ payload }) {
  try {
    const { thread } = payload
    console.log('Thread created:', thread)

    yield put(
      notification_actions.show_notification({
        severity: 'success',
        duration: 8000,
        component: ThreadCreatedNotification,
        component_props: { thread }
      })
    )
  } catch (error) {
    console.error('Error handling thread created event:', error)
  }
}

export function* handle_thread_timeline_entry_added({ payload }) {
  try {
    const { thread_id, entry, thread_title } = payload

    // Skip notification if user is currently viewing this thread
    const current_path = history.location.pathname
    const is_viewing_thread = current_path === `/thread/${thread_id}`

    if (is_viewing_thread) {
      console.log(`Skipping notification - user is viewing thread ${thread_id}`)
      return
    }

    console.log(`New timeline entry for thread ${thread_id}:`, entry.type)

    // Use thread_title from payload, fallback to fetching if not available
    let final_thread_title = thread_title
    if (!final_thread_title) {
      const metadata = yield call(get_thread_metadata, thread_id)
      final_thread_title = metadata.thread_title
    }

    yield put(
      notification_actions.show_notification({
        severity: 'info',
        duration: 6000,
        component: ThreadEventNotification,
        component_props: {
          thread_id,
          thread_title: final_thread_title,
          entry
        }
      })
    )
  } catch (error) {
    console.error('Error handling timeline entry added event:', error)
  }
}

//= ====================================
//  JOB QUEUE EVENT HANDLERS
//= ====================================

export function* handle_thread_job_failed({ payload }) {
  try {
    const { thread_id, job_id, error } = payload
    console.error(`Thread ${thread_id} job failed:`, job_id, error)

    yield call(show_success_notification, `Job failed for thread ${thread_id}`)
  } catch (err) {
    console.error('Error handling job failed event:', err)
  }
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

// WebSocket event watchers
export function* watch_thread_created() {
  yield takeEvery(threads_action_types.THREAD_CREATED, handle_thread_created)
}

export function* watch_thread_timeline_entry_added() {
  yield takeEvery(
    threads_action_types.THREAD_TIMELINE_ENTRY_ADDED,
    handle_thread_timeline_entry_added
  )
}

// Job queue event watchers
export function* watch_thread_job_failed() {
  yield takeEvery(
    threads_action_types.THREAD_JOB_FAILED,
    handle_thread_job_failed
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
  // WebSocket events
  fork(watch_thread_created),
  fork(watch_thread_timeline_entry_added),
  // Job queue events
  fork(watch_thread_job_failed)
]
