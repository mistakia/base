import { createSelector } from 'reselect'

export function get_active_sessions_state(state) {
  return state.get('active_sessions')
}

export const get_all_active_sessions = createSelector(
  [get_active_sessions_state],
  (active_sessions_state) => {
    const sessions_map = active_sessions_state.get('sessions')

    if (!sessions_map || sessions_map.size === 0) {
      return []
    }

    return sessions_map
      .valueSeq()
      .map((session) => session.toJS())
      .toArray()
  }
)

export function get_active_session_by_id(state, session_id) {
  const active_sessions_state = get_active_sessions_state(state)
  const session =
    active_sessions_state.getIn(['sessions', session_id]) ||
    active_sessions_state.getIn(['ended_sessions', session_id])
  return session ? session.toJS() : null
}

export function get_active_session_for_thread(state, thread_id) {
  if (!thread_id) return null

  const sessions = get_all_active_sessions(state)
  return (
    sessions.find((session) => {
      return session.thread_id === thread_id
    }) || null
  )
}

export function get_active_sessions_count(state) {
  const active_sessions_state = get_active_sessions_state(state)
  const sessions_map = active_sessions_state.get('sessions')
  return sessions_map ? sessions_map.size : 0
}

export function get_ended_sessions_count(state) {
  const active_sessions_state = get_active_sessions_state(state)
  const ended_map = active_sessions_state.get('ended_sessions')
  return ended_map ? ended_map.size : 0
}

export function get_active_sessions_loading(state) {
  return get_active_sessions_state(state).get('is_loading')
}

export function get_active_sessions_error(state) {
  return get_active_sessions_state(state).get('error')
}

export const get_prompt_snippets = createSelector(
  [get_active_sessions_state],
  (active_sessions_state) => {
    const snippets_map = active_sessions_state.get('prompt_snippets')
    return snippets_map ? snippets_map.toJS() : {}
  }
)

export const get_pending_sessions = createSelector(
  [get_active_sessions_state],
  (active_sessions_state) => {
    const pending_map = active_sessions_state.get('pending_sessions')

    if (!pending_map || pending_map.size === 0) {
      return []
    }

    return pending_map
      .valueSeq()
      .map((session) => (session.toJS ? session.toJS() : session))
      .toArray()
  }
)

export const get_all_sessions_with_pending = createSelector(
  [get_active_sessions_state],
  (active_sessions_state) => {
    const sessions_map = active_sessions_state.get('sessions')
    const pending_map = active_sessions_state.get('pending_sessions')
    const ended_map = active_sessions_state.get('ended_sessions')

    const active = sessions_map
      ? sessions_map
          .valueSeq()
          .map((s) => {
            const session_js = s.toJS ? s.toJS() : s
            return { ...session_js, is_pending: false }
          })
          .toArray()
      : []

    const pending = pending_map
      ? pending_map
          .valueSeq()
          .map((s) => {
            const session_js = s.toJS ? s.toJS() : s
            return { ...session_js, is_pending: true }
          })
          .toArray()
      : []

    const ended = ended_map
      ? ended_map
          .valueSeq()
          .map((s) => {
            const session_js = s.toJS ? s.toJS() : s
            return { ...session_js, is_pending: false, is_ended: true }
          })
          .toArray()
      : []

    // Sort by thread_created_at (immutable) when available, falling back to
    // session created_at for pending sessions that don't have a thread yet.
    // thread_created_at never changes, so ordering is stable across session
    // lifecycle transitions (pending -> active -> ended -> resumed).
    const all_sessions = [...pending, ...active, ...ended]
    all_sessions.sort((a, b) => {
      const a_time = new Date(
        a.thread_created_at || a.created_at || a.started_at || 0
      ).getTime()
      const b_time = new Date(
        b.thread_created_at || b.created_at || b.started_at || 0
      ).getTime()
      if (b_time !== a_time) return b_time - a_time
      const a_id = a.session_id || a.job_id || ''
      const b_id = b.session_id || b.job_id || ''
      return a_id.localeCompare(b_id)
    })

    return all_sessions
  }
)

// Memoized selector for active sessions with thread info
export const get_active_sessions_with_details = createSelector(
  [get_active_sessions_state],
  (active_sessions_state) => {
    const sessions_map = active_sessions_state.get('sessions')

    if (!sessions_map || sessions_map.size === 0) {
      return []
    }

    return sessions_map
      .valueSeq()
      .map((session) => {
        const session_js = session.toJS ? session.toJS() : session
        return {
          ...session_js,
          // Calculate elapsed time since last activity
          elapsed_ms: session_js.last_activity_at
            ? Date.now() - new Date(session_js.last_activity_at).getTime()
            : 0
        }
      })
      .toArray()
  }
)
