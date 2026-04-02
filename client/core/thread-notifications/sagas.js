import { takeEvery, select, fork } from 'redux-saga/effects'

import { active_sessions_action_types } from '@core/active-sessions/actions'
import { get_app, get_notification_sound_enabled } from '@core/app/selectors'
import { get_threads_state } from '@core/threads/selectors'
import { get_thread_sheet_active_sheet } from '@core/thread-sheet/selectors'

const previous_statuses = new Map()

function play_notification_sound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.connect(gain)
    gain.connect(ctx.destination)

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, ctx.currentTime)
    oscillator.frequency.setValueAtTime(1047, ctx.currentTime + 0.1)

    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.3)
  } catch {
    // Browser may block audio context creation
  }
}

function* handle_session_updated({ payload }) {
  const { session } = payload
  const session_id = session.session_id
  const status = session.status
  const thread_id = session.thread_id

  const previous_status = previous_statuses.get(session_id)
  previous_statuses.set(session_id, status)

  if (previous_status !== 'active' || status !== 'idle') return

  const sound_enabled = yield select(get_notification_sound_enabled)
  if (!sound_enabled) return

  const app = yield select(get_app)
  const user_public_key = app.get('user_public_key')
  if (!user_public_key || !thread_id) return

  const threads_state = yield select(get_threads_state)
  const threads = threads_state.get('threads')
  const thread = threads?.get(thread_id)
  if (!thread || thread.get('user_public_key') !== user_public_key) return

  const router = yield select((state) => state.get('router'))
  const pathname = router?.location?.pathname || ''
  const viewing_thread_page =
    pathname.startsWith('/thread/') && pathname.includes(thread_id)

  const active_sheet = yield select(get_thread_sheet_active_sheet)
  const viewing_in_sheet = active_sheet === thread_id

  if (!viewing_thread_page && !viewing_in_sheet) return

  play_notification_sound()
}

function* handle_session_ended({ payload }) {
  previous_statuses.delete(payload.session_id)
}

function* watch_session_updated() {
  yield takeEvery(
    active_sessions_action_types.ACTIVE_SESSION_UPDATED,
    handle_session_updated
  )
}

function* watch_session_ended() {
  yield takeEvery(
    active_sessions_action_types.ACTIVE_SESSION_ENDED,
    handle_session_ended
  )
}

export const thread_notifications_sagas = [
  fork(watch_session_updated),
  fork(watch_session_ended)
]
