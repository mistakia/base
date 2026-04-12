import { createSelector } from 'reselect'

export function get_active_sessions_state(state) {
  return state.get('active_sessions')
}

export const get_all_active_sessions = createSelector(
  [get_active_sessions_state],
  (active_sessions_state) => {
    const session_data = active_sessions_state.get('session_data')

    if (!session_data || session_data.size === 0) {
      return []
    }

    return session_data
      .entrySeq()
      .map(([session_id, data]) => ({
        session_id,
        ...data.toJS()
      }))
      .toArray()
  }
)

export function get_active_session_by_id(state, session_id) {
  const active_sessions_state = get_active_sessions_state(state)
  const data = active_sessions_state.getIn(['session_data', session_id])
  return data ? { session_id, ...data.toJS() } : null
}

export function get_active_session_for_thread(state, thread_id) {
  if (!thread_id) return null

  const active_sessions_state = get_active_sessions_state(state)
  const session_data = active_sessions_state.get('session_data')
  const entry = session_data.findEntry(
    (data) => data.get('thread_id') === thread_id
  )

  if (entry) {
    const [session_id, data] = entry
    return { session_id, ...data.toJS() }
  }

  return null
}

/**
 * Get session data for a specific thread_id (for panel enrichment).
 */
export function get_session_data_by_thread_id(state, thread_id) {
  return get_active_session_for_thread(state, thread_id)
}

export function get_active_sessions_count(state) {
  const active_sessions_state = get_active_sessions_state(state)
  const session_data = active_sessions_state.get('session_data')
  return session_data ? session_data.size : 0
}

export function get_active_sessions_loading(state) {
  return get_active_sessions_state(state).get('is_loading')
}

export function get_active_sessions_error(state) {
  return get_active_sessions_state(state).get('error')
}

// Backward-compatible exports (return empty data for removed state)
export function get_ended_sessions_count() {
  return 0
}

export const get_prompt_snippets = createSelector(
  [get_active_sessions_state],
  () => ({})
)

export const get_pending_sessions = createSelector(
  [get_active_sessions_state],
  () => []
)

export const get_all_sessions_with_pending = createSelector(
  [get_active_sessions_state],
  (active_sessions_state) => {
    const session_data = active_sessions_state.get('session_data')

    if (!session_data || session_data.size === 0) {
      return []
    }

    return session_data
      .entrySeq()
      .map(([session_id, data]) => ({
        session_id,
        ...data.toJS(),
        is_pending: false
      }))
      .toArray()
  }
)
