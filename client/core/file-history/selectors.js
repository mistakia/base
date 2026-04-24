export function get_file_history_state(state) {
  return state.get('file_history')
}

export function get_file_history_commits(state) {
  return get_file_history_state(state).get('commits') || []
}

export function get_is_loading_file_history(state) {
  return get_file_history_state(state).get('is_loading')
}

export function get_file_history_page(state) {
  return get_file_history_state(state).get('page')
}

export function get_file_history_per_page(state) {
  return get_file_history_state(state).get('per_page')
}

export function get_file_history_total_count(state) {
  return get_file_history_state(state).get('total_count')
}

export function get_file_history_total_pages(state) {
  return get_file_history_state(state).get('total_pages')
}

export function get_file_history_count_capped(state) {
  return get_file_history_state(state).get('count_capped')
}

export function get_file_history_repo_name(state) {
  return get_file_history_state(state).get('repo_name')
}

export function get_file_history_branch(state) {
  return get_file_history_state(state).get('branch')
}

export function get_file_history_base_uri(state) {
  return get_file_history_state(state).get('base_uri')
}

export function get_file_history_current_path(state) {
  return get_file_history_state(state).get('current_path')
}

export function get_file_history_error(state) {
  return get_file_history_state(state).get('error')
}
