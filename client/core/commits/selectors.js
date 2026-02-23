export function get_commits_state(state) {
  return state.get('commits')
}

export function get_commits_list(state) {
  return get_commits_state(state).get('commits') || []
}

export function get_is_loading_commits(state) {
  return get_commits_state(state).get('is_loading_commits')
}

export function get_commits_page(state) {
  return get_commits_state(state).get('page')
}

export function get_commits_total_count(state) {
  return get_commits_state(state).get('total_count')
}

export function get_commits_per_page(state) {
  return get_commits_state(state).get('per_page')
}

export function get_commits_total_pages(state) {
  const total_count = get_commits_total_count(state)
  const per_page = get_commits_per_page(state)
  return Math.max(1, Math.ceil(total_count / per_page))
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
