import { takeEvery, select, fork } from 'redux-saga/effects'

import { active_sessions_action_types } from '@core/active-sessions/actions'
import { get_notification_sound_enabled } from '@core/app/selectors'

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

  const previous_status = previous_statuses.get(session_id)
  previous_statuses.set(session_id, status)

  if (previous_status === 'active' && status === 'idle') {
    const sound_enabled = yield select(get_notification_sound_enabled)
    if (sound_enabled) {
      play_notification_sound()
    }
  }
}

function* watch_session_updated() {
  yield takeEvery(
    active_sessions_action_types.ACTIVE_SESSION_UPDATED,
    handle_session_updated
  )
}

export const thread_notifications_sagas = [fork(watch_session_updated)]
