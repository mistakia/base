import {
  takeLatest,
  takeEvery,
  fork,
  call,
  delay,
  put
} from 'redux-saga/effects'

import { get_active_sessions } from '@core/api/sagas'
import { active_sessions_action_types } from './actions'
import { threads_action_types } from '@core/threads/actions'
import { websocket_actions } from '@core/websocket/actions'
import {
  subscribe_to_thread,
  unsubscribe_from_thread
} from '@core/websocket/service'
import { LIVE_STATUSES } from '#libs-shared/thread-lifecycle.mjs'

//= ====================================
//  ACTIVE SESSIONS LOADING SAGAS
//= ====================================

export function* load_active_sessions() {
  yield call(get_active_sessions)
}

//= ====================================
//  THREAD AUTO-SUBSCRIBE
//= ====================================

const ACTIVE_SESSION_STATUSES = new Set(LIVE_STATUSES)

// Server emits THREAD_UPDATED with terminal status (completed/failed)
// before flushing the final timeline writes -- in observed runs the
// remaining THREAD_TIMELINE_ENTRY_ADDED burst trails the status change
// by ~100ms. Unsubscribing on the status edge causes the server to send
// those late entries truncated, and the reducer drops them. Defer the
// unsubscribe long enough to absorb the trailing burst, and cancel the
// pending unsubscribe if the thread re-enters an active status (resume).
const UNSUBSCRIBE_DEFERRAL_MS = 10000
const pending_unsubscribe_timers = new Map()

const cancel_pending_unsubscribe = (thread_id) => {
  const handle = pending_unsubscribe_timers.get(thread_id)
  if (handle) {
    clearTimeout(handle)
    pending_unsubscribe_timers.delete(thread_id)
  }
}

const schedule_unsubscribe = (thread_id) => {
  cancel_pending_unsubscribe(thread_id)
  const handle = setTimeout(() => {
    pending_unsubscribe_timers.delete(thread_id)
    unsubscribe_from_thread(thread_id)
  }, UNSUBSCRIBE_DEFERRAL_MS)
  pending_unsubscribe_timers.set(thread_id, handle)
}

export function* handle_thread_auto_subscribe({ payload }) {
  const thread = payload.thread || payload.data || {}
  const thread_id = thread.thread_id
  const session_status = thread.session_status

  if (!thread_id) return

  if (ACTIVE_SESSION_STATUSES.has(session_status)) {
    cancel_pending_unsubscribe(thread_id)
    yield call(() => subscribe_to_thread(thread_id))
  } else if (session_status === 'completed' || session_status === 'failed') {
    yield call(() => schedule_unsubscribe(thread_id))
  }
}

//= ====================================
//  RECONNECT RECOVERY
//= ====================================

export function* reconnect_recovery() {
  yield put({
    type: active_sessions_action_types.LOAD_ACTIVE_SESSIONS
  })
}

//= ====================================
//  PERIODIC POLLING
//= ====================================

const POLL_INTERVAL_MS = 15 * 1000

export function* poll_active_sessions() {
  while (true) {
    yield delay(POLL_INTERVAL_MS)
    yield put({
      type: active_sessions_action_types.LOAD_ACTIVE_SESSIONS
    })
  }
}

//= ====================================
//  WATCHERS
//= ====================================

export function* watch_load_active_sessions() {
  yield takeLatest(
    active_sessions_action_types.LOAD_ACTIVE_SESSIONS,
    load_active_sessions
  )
}

export function* watch_thread_auto_subscribe() {
  yield takeEvery(
    [threads_action_types.THREAD_CREATED, threads_action_types.THREAD_UPDATED],
    handle_thread_auto_subscribe
  )
}

export function* watch_websocket_reconnected() {
  yield takeLatest(websocket_actions.WEBSOCKET_RECONNECTED, reconnect_recovery)
}

//= ====================================
//  ROOT SAGA EXPORT
//= ====================================

export const active_sessions_sagas = [
  fork(watch_load_active_sessions),
  fork(watch_thread_auto_subscribe),
  fork(watch_websocket_reconnected),
  fork(poll_active_sessions)
]
