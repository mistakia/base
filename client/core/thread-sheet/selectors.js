export function get_thread_sheet_is_open(state) {
  return state.getIn(['thread_sheet', 'is_open'])
}

export function get_thread_sheet_thread_id(state) {
  return state.getIn(['thread_sheet', 'thread_id'])
}

export function get_thread_sheet_data(state) {
  return state.getIn(['thread_sheet', 'thread_data'])
}

export function get_thread_sheet_is_loading(state) {
  return state.getIn(['thread_sheet', 'is_loading'])
}

export function get_thread_sheet_error(state) {
  return state.getIn(['thread_sheet', 'error'])
}
