import { List } from 'immutable'

export function get_thread_sheet_sheets(state) {
  return state.getIn(['thread_sheet', 'sheets']) || List()
}

export function get_thread_sheet_has_open(state) {
  const sheets = get_thread_sheet_sheets(state)
  return sheets.size > 0
}

export function get_thread_sheet_data_for_id(state, thread_id) {
  return state.getIn(['thread_sheet', 'sheet_data', thread_id, 'thread_data'])
}

export function get_thread_sheet_is_loading_for_id(state, thread_id) {
  return state.getIn([
    'thread_sheet',
    'sheet_data',
    thread_id,
    'is_loading'
  ])
}

export function get_thread_sheet_error_for_id(state, thread_id) {
  return state.getIn(['thread_sheet', 'sheet_data', thread_id, 'error'])
}

// Backward-compatible selectors (for FloatingSessionsPanel collapse behavior)
export function get_thread_sheet_is_open(state) {
  return get_thread_sheet_has_open(state)
}
