export function get_commits_state(state) {
  return state.get('commits')
}

export function get_commits_list(state) {
  return get_commits_state(state).get('commits') || []
}

export function get_is_loading_commits(state) {
  return get_commits_state(state).get('is_loading_commits')
}

export function get_is_loading_more_commits(state) {
  return get_commits_state(state).get('is_loading_more')
}

export function get_has_more_commits(state) {
  return get_commits_state(state).get('has_more')
}

export function get_next_cursor(state) {
  return get_commits_state(state).get('next_cursor')
}

export function get_commits_repo_name(state) {
  return get_commits_state(state).get('repo_name')
}

export function get_commits_branch(state) {
  return get_commits_state(state).get('branch')
}

export function get_commit_detail(state) {
  return get_commits_state(state).get('commit_detail') || null
}

export function get_is_loading_commit_detail(state) {
  return get_commits_state(state).get('is_loading_detail')
}
