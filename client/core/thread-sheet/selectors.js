export function get_thread_sheet_active_sheet(state) {
  return state.getIn(['thread_sheet', 'active_sheet']) || null
}

export function get_thread_sheet_has_open(state) {
  return !!get_thread_sheet_active_sheet(state)
}

export function get_thread_sheet_data_for_id(state, thread_id) {
  return state.getIn(['threads', 'thread_cache', thread_id]) || null
}

export function get_thread_sheet_is_loading_for_id(state, thread_id) {
  return (
    state.getIn(['threads', 'thread_loading', thread_id, 'is_loading']) || false
  )
}

export function get_thread_sheet_error_for_id(state, thread_id) {
  return state.getIn(['threads', 'thread_loading', thread_id, 'error']) || null
}

export function get_thread_sheet_is_open(state) {
  return get_thread_sheet_has_open(state)
}
