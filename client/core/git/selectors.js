import { createSelector } from 'reselect'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Immutable.js object to plain JS object if needed
 */
const to_plain = (immutable_obj) =>
  immutable_obj?.toJS ? immutable_obj.toJS() : immutable_obj

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

export function get_file_at_ref_map(state) {
  return get_git_state(state).get('file_at_ref')
}

export function get_file_content_map(state) {
  return get_git_state(state).get('file_content')
}

export function get_conflict_versions_map(state) {
  return get_git_state(state).get('conflict_versions')
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

export function get_is_loading_file_at_ref(state) {
  return get_git_state(state).get('loading_file_at_ref_keys').size > 0
}

export function get_is_loading_file_at_ref_for_key(
  state,
  repo_path,
  file_path,
  ref = 'HEAD'
) {
  const cache_key = `${repo_path}:${file_path}:${ref}`
  return get_git_state(state).get('loading_file_at_ref_keys').has(cache_key)
}

export function get_is_loading_file_content(state) {
  return get_git_state(state).get('loading_file_content_keys').size > 0
}

export function get_is_loading_file_content_for_key(
  state,
  repo_path,
  file_path
) {
  const cache_key = `${repo_path}:${file_path}`
  return get_git_state(state).get('loading_file_content_keys').has(cache_key)
}

export function get_is_loading_conflict_versions(state) {
  return get_git_state(state).get('is_loading_conflict_versions')
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

export function get_is_resolving_conflict(state) {
  return get_git_state(state).get('is_resolving_conflict')
}

export function get_is_generating_commit_message(state) {
  return get_git_state(state).get('is_generating_commit_message')
}

export function get_is_auto_committing(state) {
  return get_git_state(state).get('is_auto_committing')
}

/**
 * Check if a file still has changes (appears in staged, unstaged, or untracked).
 * Returns the change status or null if file has no changes.
 */
export function get_file_change_status(state, repo_path, relative_path) {
  if (!repo_path || !relative_path) return null
  const repo = get_repo_status(state, repo_path)
  if (!repo) return null

  if (repo.staged?.some((f) => f.path === relative_path)) return 'staged'
  if (repo.unstaged?.some((f) => f.path === relative_path)) return 'unstaged'
  if (repo.untracked?.some((f) => f.path === relative_path)) return 'untracked'
  return null
}

export function get_generated_commit_message(state) {
  return get_git_state(state).get('generated_commit_message')
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

  return repos_map.valueSeq().map(to_plain).toArray()
})

/**
 * Get repositories with changes
 */
export const get_repos_with_changes = createSelector([get_all_repos], (repos) =>
  repos.filter((repo) => repo.has_changes)
)

/**
 * Get total count of changed files across all repos (including conflicts)
 */
export const get_total_changed_files_count = createSelector(
  [get_repos_with_changes],
  (repos) => {
    return repos.reduce((total, repo) => {
      const staged = repo.staged?.length || 0
      const unstaged = repo.unstaged?.length || 0
      const untracked = repo.untracked?.length || 0
      const conflicts = repo.conflicts?.length || 0
      return total + staged + unstaged + untracked + conflicts
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
    return repo ? to_plain(repo) : null
  }
)

/**
 * Get status for a specific repo
 */
export function get_repo_status(state, repo_path) {
  const repos_map = get_repos_map(state)
  if (!repos_map) return null

  const repo = repos_map.get(repo_path)
  return repo ? to_plain(repo) : null
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
  return diff ? to_plain(diff) : null
}

/**
 * Get file content at a specific git ref
 */
export function get_file_at_ref(state, repo_path, file_path, ref = 'HEAD') {
  const file_at_ref_map = get_file_at_ref_map(state)
  if (!file_at_ref_map) return null

  const cache_key = `${repo_path}:${file_path}:${ref}`
  const file_data = file_at_ref_map.get(cache_key)
  return file_data ? to_plain(file_data) : null
}

/**
 * Get file content from working copy
 */
export function get_file_content(state, repo_path, file_path) {
  const file_content_map = get_file_content_map(state)
  if (!file_content_map) return null

  const cache_key = `${repo_path}:${file_path}`
  const file_data = file_content_map.get(cache_key)
  return file_data ? to_plain(file_data) : null
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

// Change types in priority order (conflicts first)
const CHANGE_TYPES = ['conflicts', 'staged', 'unstaged', 'untracked']

/**
 * Get all changed files grouped by repo (including conflicts)
 */
export const get_all_changed_files = createSelector(
  [get_repos_with_changes],
  (repos) => {
    const result = []

    for (const repo of repos) {
      for (const change_type of CHANGE_TYPES) {
        for (const file of repo[change_type] || []) {
          result.push({
            ...file,
            repo_path: repo.repo_path,
            repo_name: repo.repo_name,
            change_type: change_type === 'conflicts' ? 'conflict' : change_type
          })
        }
      }
    }

    return result
  }
)

/**
 * Get conflict versions for a specific file
 */
export function get_conflict_versions(state, repo_path, file_path) {
  const conflict_versions_map = get_conflict_versions_map(state)
  if (!conflict_versions_map) return null

  const cache_key = `${repo_path}:${file_path}`
  const versions = conflict_versions_map.get(cache_key)
  return versions ? to_plain(versions) : null
}

/**
 * Check if a repo is in a merge state
 */
export function get_is_repo_merging(state, repo_path) {
  const repo = get_repo_status(state, repo_path)
  return repo?.is_merging ?? false
}

/**
 * Get merge branch names for a repo
 * Returns { ours_branch, theirs_branch } or null if not merging
 */
export function get_repo_merge_branches(state, repo_path) {
  const repo = get_repo_status(state, repo_path)
  if (!repo?.is_merging) return null

  return {
    ours_branch: repo.ours_branch,
    theirs_branch: repo.theirs_branch
  }
}

// ============================================================================
// Repository Info Selectors
// ============================================================================

/**
 * Get repository info for a specific path (statistics)
 * @param {Object} state - Redux state
 * @param {string} path - Directory path
 */
export function get_repo_info(state, path = '') {
  const repo_info = get_git_state(state).getIn(['repo_info_by_path', path])
  return repo_info ? to_plain(repo_info) : null
}

/**
 * Check if loading repo info for a specific path
 * @param {Object} state - Redux state
 * @param {string} path - Directory path to check
 */
export function get_is_loading_repo_info(state, path = '') {
  const git_state = get_git_state(state)
  const is_loading = git_state.get('is_loading_repo_info')
  const loading_path = git_state.get('loading_repo_info_path')
  return is_loading && loading_path === path
}

/**
 * Check if path is a git root (has cached repo info showing it's a git root)
 * @param {Object} state - Redux state
 * @param {string} path - Directory path
 */
export function get_is_git_root(state, path = '') {
  const repo_info = get_git_state(state).getIn(['repo_info_by_path', path])
  return repo_info?.get('is_git_root') ?? false
}

/**
 * Get repository statistics for a path
 * @param {Object} state - Redux state
 * @param {string} path - Directory path
 */
export function get_repo_statistics(state, path = '') {
  const repo_info = get_git_state(state).getIn(['repo_info_by_path', path])
  if (!repo_info || !repo_info.get('is_git_root')) return null

  const statistics = repo_info.get('statistics')
  return statistics ? to_plain(statistics) : null
}

/**
 * Check if repo info is already cached for a path
 * @param {Object} state - Redux state
 * @param {string} path - Directory path
 */
export function has_cached_repo_info(state, path = '') {
  return get_git_state(state).hasIn(['repo_info_by_path', path])
}
