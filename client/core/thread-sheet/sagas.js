import { takeEvery, fork, call, select } from 'redux-saga/effects'

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
    session_id = payload.thread?.source?.session_id
  }

  if (!thread_id || !session_id) return

  // Check if this thread_id is now in the sheets stack (meaning transition happened)
  const sheets = yield select((state) =>
    state.getIn(['thread_sheet', 'sheets'])
  )
  if (!sheets || !sheets.includes(thread_id)) return

  // Skip if thread data is already loading or loaded (handles duplicate events
  // when both ACTIVE_SESSION_UPDATED and THREAD_CREATED fire for the same session)
  const sheet_data = yield select((state) =>
    state.getIn(['thread_sheet', 'sheet_data', thread_id])
  )
  if (sheet_data && (sheet_data.get('is_loading') || sheet_data.get('thread_data'))) return

  // Load thread data and subscribe
  subscribe_to_thread(thread_id)
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

export const thread_sheet_sagas = [
  fork(watch_load_sheet_thread),
  fork(watch_session_sheet_transitions)
]
