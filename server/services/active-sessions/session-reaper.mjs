import debug from 'debug'

import config from '#config'
import {
  get_all_active_sessions,
  get_and_remove_active_session
} from '#server/services/active-sessions/active-session-store.mjs'
import { emit_active_session_ended } from '#server/services/active-sessions/session-event-emitter.mjs'

const log = debug('active-sessions:reaper')

const TICK_INTERVAL_MS = 30 * 1000
const DEFAULT_ACTIVE_THRESHOLD_SECONDS = 120
const DEFAULT_IDLE_THRESHOLD_SECONDS = 300

let reaper_timer = null

const get_thresholds = () => ({
  active_threshold_ms:
    (config.active_sessions?.reaper_active_threshold_seconds ||
      DEFAULT_ACTIVE_THRESHOLD_SECONDS) * 1000,
  idle_threshold_ms:
    (config.active_sessions?.reaper_idle_threshold_seconds ||
      DEFAULT_IDLE_THRESHOLD_SECONDS) * 1000
})

/**
 * Reap one batch of stale sessions. Sessions whose last_activity_at exceeds
 * the status-dependent threshold are removed and an ENDED event is emitted.
 * Exported for testing.
 */
export const reap_stale_sessions = async ({ now = Date.now() } = {}) => {
  const { active_threshold_ms, idle_threshold_ms } = get_thresholds()
  const sessions = await get_all_active_sessions()

  let reaped = 0
  for (const session of sessions) {
    const last_activity = session.last_activity_at
      ? new Date(session.last_activity_at).getTime()
      : 0
    if (!last_activity) continue

    const age_ms = now - last_activity
    const threshold_ms =
      session.status === 'idle' ? idle_threshold_ms : active_threshold_ms
    if (age_ms < threshold_ms) continue

    const removed = await get_and_remove_active_session(session.session_id)
    if (!removed) continue

    await emit_active_session_ended(session.session_id, removed)
    reaped += 1
    log(
      `Reaped stale session ${session.session_id} status=${session.status} age_ms=${age_ms}`
    )
  }

  if (reaped > 0) {
    log(`Reaper tick reaped ${reaped} session(s)`)
  }

  return reaped
}

export const start_session_reaper = () => {
  if (reaper_timer) return
  reaper_timer = setInterval(async () => {
    try {
      await reap_stale_sessions()
    } catch (error) {
      log(`Reaper tick error: ${error.message}`)
    }
  }, TICK_INTERVAL_MS)
  // Do not keep the event loop alive solely for the reaper during shutdown.
  if (typeof reaper_timer.unref === 'function') reaper_timer.unref()
  log('Session reaper started')
}

export const stop_session_reaper = () => {
  if (!reaper_timer) return
  clearInterval(reaper_timer)
  reaper_timer = null
  log('Session reaper stopped')
}
