import { createSelector } from 'reselect'

export function get_active_sessions_state(state) {
  return state.get('active_sessions')
}

export function get_all_active_sessions(state) {
  const active_sessions_state = get_active_sessions_state(state)
  const sessions_map = active_sessions_state.get('sessions')

  if (!sessions_map || sessions_map.size === 0) {
    return []
  }

  return sessions_map
    .valueSeq()
    .map((session) => session.toJS())
    .toArray()
}

export function get_active_session_by_id(state, session_id) {
  const active_sessions_state = get_active_sessions_state(state)
  const session = active_sessions_state.getIn(['sessions', session_id])
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

export function get_active_sessions_loading(state) {
  return get_active_sessions_state(state).get('is_loading')
}

export function get_active_sessions_error(state) {
  return get_active_sessions_state(state).get('error')
}

export function get_prompt_snippets(state) {
  const active_sessions_state = get_active_sessions_state(state)
  const snippets_map = active_sessions_state.get('prompt_snippets')
  return snippets_map ? snippets_map.toJS() : {}
}

export function get_pending_sessions(state) {
  const active_sessions_state = get_active_sessions_state(state)
  const pending_map = active_sessions_state.get('pending_sessions')

  if (!pending_map || pending_map.size === 0) {
    return []
  }

  return pending_map
    .valueSeq()
    .map((session) => (session.toJS ? session.toJS() : session))
    .toArray()
}

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

    return [...pending, ...active, ...ended]
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
