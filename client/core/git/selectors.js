import { createSelector } from 'reselect'

// ============================================================================
// Base Selectors
// ============================================================================

export function get_git_state(state) {
  return state.get('git')
}

export function get_repos_map(state) {
  return get_git_state(state).get('repos')
}

export function get_active_repo_path(state) {
  return get_git_state(state).get('active_repo')
}

export function get_selected_file(state) {
  const selected = get_git_state(state).get('selected_file')
  return selected ? selected.toJS() : null
}

export function get_diffs_map(state) {
  return get_git_state(state).get('diffs')
}

// ============================================================================
// Loading State Selectors
// ============================================================================

export function get_is_loading_status(state) {
  return get_git_state(state).get('is_loading_status')
}

export function get_is_loading_diff(state) {
  return get_git_state(state).get('is_loading_diff')
}

export function get_is_committing(state) {
  return get_git_state(state).get('is_committing')
}

export function get_is_pulling(state) {
  return get_git_state(state).get('is_pulling')
}

export function get_is_pushing(state) {
  return get_git_state(state).get('is_pushing')
}

export function get_git_error(state) {
  return get_git_state(state).get('error')
}

// ============================================================================
// Derived Selectors
// ============================================================================

/**
 * Get all repositories as an array
 */
export const get_all_repos = createSelector([get_repos_map], (repos_map) => {
  if (!repos_map || repos_map.size === 0) {
    return []
  }

  return repos_map
    .valueSeq()
    .map((repo) => (repo.toJS ? repo.toJS() : repo))
    .toArray()
})

/**
 * Get repositories with changes
 */
export const get_repos_with_changes = createSelector([get_all_repos], (repos) =>
  repos.filter((repo) => repo.has_changes)
)

/**
 * Get total count of changed files across all repos
 */
export const get_total_changed_files_count = createSelector(
  [get_repos_with_changes],
  (repos) => {
    return repos.reduce((total, repo) => {
      const staged = repo.staged?.length || 0
      const unstaged = repo.unstaged?.length || 0
      const untracked = repo.untracked?.length || 0
      return total + staged + unstaged + untracked
    }, 0)
  }
)

/**
 * Get active repository status
 */
export const get_active_repo_status = createSelector(
  [get_repos_map, get_active_repo_path],
  (repos_map, active_repo_path) => {
    if (!active_repo_path || !repos_map) return null

    const repo = repos_map.get(active_repo_path)
    return repo ? (repo.toJS ? repo.toJS() : repo) : null
  }
)

/**
 * Get status for a specific repo
 */
export function get_repo_status(state, repo_path) {
  const repos_map = get_repos_map(state)
  if (!repos_map) return null

  const repo = repos_map.get(repo_path)
  return repo ? (repo.toJS ? repo.toJS() : repo) : null
}

/**
 * Get diff for a specific file
 */
export function get_file_diff(state, repo_path, file_path) {
  const diffs_map = get_diffs_map(state)
  if (!diffs_map) return null

  const diff_key = file_path || '__all__'
  const repo_diffs = diffs_map.get(repo_path)
  if (!repo_diffs) return null

  const diff = repo_diffs.get(diff_key)
  return diff ? (diff.toJS ? diff.toJS() : diff) : null
}

/**
 * Check if any repo has conflicts
 */
export const get_has_any_conflicts = createSelector([get_all_repos], (repos) =>
  repos.some((repo) => repo.has_conflicts)
)

/**
 * Get write permission for a specific repo
 */
export function get_repo_write_allowed(state, repo_path) {
  const repo = get_repo_status(state, repo_path)
  return repo?.write_allowed ?? false
}

/**
 * Check if any repo has write permission
 */
export const get_has_any_writable = createSelector([get_all_repos], (repos) =>
  repos.some((repo) => repo.write_allowed === true)
)

/**
 * Check if any repo can push (is ahead of remote)
 */
export const get_has_any_pushable = createSelector([get_all_repos], (repos) =>
  repos.some((repo) => repo.ahead > 0)
)

/**
 * Get all changed files grouped by repo
 */
export const get_all_changed_files = createSelector(
  [get_repos_with_changes],
  (repos) => {
    const result = []

    for (const repo of repos) {
      // Add staged files
      for (const file of repo.staged || []) {
        result.push({
          ...file,
          repo_path: repo.repo_path,
          repo_name: repo.repo_name,
          change_type: 'staged'
        })
      }

      // Add unstaged files
      for (const file of repo.unstaged || []) {
        result.push({
          ...file,
          repo_path: repo.repo_path,
          repo_name: repo.repo_name,
          change_type: 'unstaged'
        })
      }

      // Add untracked files
      for (const file of repo.untracked || []) {
        result.push({
          ...file,
          repo_path: repo.repo_path,
          repo_name: repo.repo_name,
          change_type: 'untracked'
        })
      }
    }

    return result
  }
)
