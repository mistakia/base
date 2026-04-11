import { expect } from 'chai'

import {
  register_active_session,
  update_active_session,
  remove_active_session,
  get_active_session,
  close_session_store
} from '#server/services/active-sessions/active-session-store.mjs'
import {
  reap_stale_sessions,
  start_session_reaper,
  stop_session_reaper
} from '#server/services/active-sessions/session-reaper.mjs'

describe('session-reaper', function () {
  this.timeout(10000)

  let active_id
  let stale_id
  let idle_id
  let counter = 0

  beforeEach(() => {
    counter += 1
    active_id = `reaper-active-${Date.now()}-${counter}`
    stale_id = `reaper-stale-${Date.now()}-${counter}`
    idle_id = `reaper-idle-${Date.now()}-${counter}`
  })

  afterEach(async () => {
    await remove_active_session(active_id)
    await remove_active_session(stale_id)
    await remove_active_session(idle_id)
  })

  after(async () => {
    stop_session_reaper()
    await close_session_store()
  })

  it('reaps sessions whose last_activity_at exceeds the active threshold', async () => {
    await register_active_session({
      session_id: stale_id,
      working_directory: '/tmp/stale',
      transcript_path: '/tmp/stale.jsonl'
    })

    // Simulate reaping "now" 10 minutes in the future so the freshly
    // registered session's last_activity_at is older than 120s threshold.
    const future_now = Date.now() + 10 * 60 * 1000
    const reaped = await reap_stale_sessions({ now: future_now })

    expect(reaped).to.be.at.least(1)
    const after = await get_active_session(stale_id)
    expect(after).to.be.null
  })

  it('preserves sessions whose last_activity_at is recent', async () => {
    await register_active_session({
      session_id: active_id,
      working_directory: '/tmp/active',
      transcript_path: '/tmp/active.jsonl'
    })

    const reaped = await reap_stale_sessions({ now: Date.now() })
    expect(reaped).to.equal(0)

    const still_there = await get_active_session(active_id)
    expect(still_there).to.be.an('object')
  })

  it('uses the longer idle threshold for idle sessions', async () => {
    await register_active_session({
      session_id: idle_id,
      working_directory: '/tmp/idle',
      transcript_path: '/tmp/idle.jsonl'
    })
    await update_active_session({ session_id: idle_id, status: 'idle' })

    // Advance 180s (> 120s active threshold, < 300s idle threshold):
    // idle sessions should NOT be reaped.
    const near_future = Date.now() + 180 * 1000
    const reaped_near = await reap_stale_sessions({ now: near_future })
    expect(reaped_near).to.equal(0)

    // Advance 6 minutes (> 300s idle threshold): idle session is reaped.
    const far_future = Date.now() + 6 * 60 * 1000
    const reaped_far = await reap_stale_sessions({ now: far_future })
    expect(reaped_far).to.be.at.least(1)

    const after = await get_active_session(idle_id)
    expect(after).to.be.null
  })

  it('stop_session_reaper clears the interval', () => {
    start_session_reaper()
    // Call twice to verify idempotence.
    start_session_reaper()
    stop_session_reaper()
    // No assertion beyond "does not throw"; interval is cleared internally.
  })
})
