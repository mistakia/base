import { takeEvery, fork, call, select, delay } from 'redux-saga/effects'

import { get_sheet_thread } from '@core/api/sagas'
import { thread_sheet_action_types } from './actions'
import { active_sessions_action_types } from '@core/active-sessions/actions'
import { threads_action_types } from '@core/threads/actions'
import { subscribe_to_thread } from '@core/websocket/service'

export function* load_sheet_thread({ payload }) {
  yield call(get_sheet_thread, payload)
}

/**
 * When a session sheet transitions to a thread sheet (via ACTIVE_SESSION_UPDATED
 * or THREAD_CREATED), auto-load thread data and subscribe to updates.
 */
export function* handle_session_sheet_transition({ type, payload }) {
  let thread_id = null
  let session_id = null

  if (type === active_sessions_action_types.ACTIVE_SESSION_UPDATED) {
    thread_id = payload.session?.thread_id
    session_id = payload.session?.session_id
  } else if (type === threads_action_types.THREAD_CREATED) {
    thread_id = payload.thread?.thread_id
    session_id = payload.thread?.external_session?.session_id
  }

  if (!thread_id || !session_id) return

  // Check if this thread_id is now the active sheet (meaning transition happened)
  const active_sheet = yield select((state) =>
    state.getIn(['thread_sheet', 'active_sheet'])
  )
  if (active_sheet !== thread_id) return

  // Skip if thread data is already loading or loaded in the cache
  const loading_state = yield select((state) =>
    state.getIn(['threads', 'thread_loading', thread_id])
  )
  const cached_data = yield select((state) =>
    state.getIn(['threads', 'thread_cache', thread_id])
  )
  if ((loading_state && loading_state.get('is_loading')) || cached_data) return

  // Load thread data and subscribe
  subscribe_to_thread(thread_id)
  yield call(get_sheet_thread, { thread_id })
}

/**
 * When a session ends, reload the thread timeline for any open thread-sheet.
 * The sync script runs asynchronously after session exit, so we delay briefly
 * to allow the thread file to be updated before fetching.
 */
export function* handle_session_ended({ payload }) {
  const { session_id } = payload

  // Find the thread_id for this session from the active-sessions store
  const session = yield select((state) =>
    state.getIn(['active_sessions', 'sessions', session_id])
  )
  const thread_id = session?.get('thread_id')
  if (!thread_id) return

  // Check if this thread is the active sheet
  const active_sheet = yield select((state) =>
    state.getIn(['thread_sheet', 'active_sheet'])
  )
  if (active_sheet !== thread_id) return

  // Delay to allow the sync script to process the final session state
  yield delay(3000)

  // Reload thread data to get the complete timeline
  yield call(get_sheet_thread, { thread_id })
}

export function* watch_load_sheet_thread() {
  yield takeEvery(
    thread_sheet_action_types.LOAD_SHEET_THREAD,
    load_sheet_thread
  )
}

export function* watch_session_sheet_transitions() {
  yield takeEvery(
    [
      active_sessions_action_types.ACTIVE_SESSION_UPDATED,
      threads_action_types.THREAD_CREATED
    ],
    handle_session_sheet_transition
  )
}

export function* watch_session_ended() {
  yield takeEvery(
    active_sessions_action_types.ACTIVE_SESSION_ENDED,
    handle_session_ended
  )
}

export const thread_sheet_sagas = [
  fork(watch_load_sheet_thread),
  fork(watch_session_sheet_transitions),
  fork(watch_session_ended)
]
