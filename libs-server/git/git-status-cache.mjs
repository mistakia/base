import debug from 'debug'

import { get_status } from './status.mjs'
import {
  is_merging,
  get_current_branch_name,
  get_merge_head_branch_name
} from '#libs-server/git/index.mjs'

const log = debug('git:status-cache')

const DEFAULT_MERGE_STATE = {
  is_merging: false,
  ours_branch: null,
  theirs_branch: null
}

/**
 * In-memory cache state
 */
let repo_list_cache = null // { repo_paths: string[], worktree_metadata: Map }
const status_cache = new Map() // Map<repo_path, { status, merge_state, updated_at }>
let cache_initializing = null // Promise (for requests arriving during cold start)
let is_initialized = false // Flag set when initialization starts (prevents race condition)
let _discover_repos_fn = null // injected repo discovery function
let _on_repo_list_changed = null // callback when repo list changes

/**
 * Initialize the cache with a full repo discovery + status fetch
 *
 * @param {Object} params
 * @param {Function} params.discover_repos - async function returning { repo_paths, worktree_metadata }
 * @param {Function} [params.on_repo_list_changed] - callback({ added, removed }) when repos change
 */
export async function initialize_cache({
  discover_repos,
  on_repo_list_changed
} = {}) {
  if (cache_initializing) {
    log('Cache already initializing, returning existing promise')
    return cache_initializing
  }

  // If cache is already initialized or initialization has started, just update the callbacks
  // The is_initialized flag prevents race condition where repo_list_cache is null
  // between when cache_initializing is cleared and repo_list_cache is set
  if (is_initialized || repo_list_cache !== null) {
    log('Cache already initialized, updating callbacks only')
    if (discover_repos) _discover_repos_fn = discover_repos
    if (on_repo_list_changed) _on_repo_list_changed = on_repo_list_changed
    return
  }

  // Mark as initialized before starting to prevent race conditions
  is_initialized = true

  _discover_repos_fn = discover_repos
  _on_repo_list_changed = on_repo_list_changed

  cache_initializing = _do_full_cache_init()

  try {
    await cache_initializing
  } finally {
    // Allow re-initialization on failure
    cache_initializing = null
  }
}

async function _do_full_cache_init() {
  log('Initializing git status cache...')
  const start = Date.now()

  // Discover all repos
  const { repo_paths, worktree_metadata } = await _discover_repos_fn()
  repo_list_cache = { repo_paths, worktree_metadata }

  // Fetch status + merge state for all repos in parallel
  const now = Date.now()
  await Promise.all(
    repo_paths.map(async (repo_path) => {
      try {
        const [status, merge_state] = await Promise.all([
          get_status({ repo_path }),
          _get_merge_state(repo_path)
        ])
        status_cache.set(repo_path, { status, merge_state, updated_at: now })
      } catch (error) {
        log('Failed to get initial status for %s: %s', repo_path, error.message)
        status_cache.set(repo_path, {
          status: _error_status(error),
          merge_state: DEFAULT_MERGE_STATE,
          updated_at: now
        })
      }
    })
  )

  log(
    'Cache initialized in %dms (%d repos)',
    Date.now() - start,
    repo_paths.length
  )
}

/**
 * Get cached status for all repos
 *
 * @returns {{ repo_paths: string[], worktree_metadata: Map, statuses: Map }}
 */
export function get_cached_status_all() {
  if (!repo_list_cache) {
    return { repo_paths: [], worktree_metadata: new Map(), statuses: new Map() }
  }

  return {
    repo_paths: repo_list_cache.repo_paths,
    worktree_metadata: repo_list_cache.worktree_metadata,
    statuses: status_cache
  }
}

/**
 * Invalidate and re-fetch status for a single repo.
 * Upstream watcher debounces at 1000ms so concurrent calls are not expected.
 *
 * @param {string} repo_path - Repository path to invalidate
 */
export async function invalidate_repo(repo_path) {
  log('Invalidating cache for %s', repo_path)
  const start = Date.now()

  try {
    const [status, merge_state] = await Promise.all([
      get_status({ repo_path }),
      _get_merge_state(repo_path)
    ])

    status_cache.set(repo_path, { status, merge_state, updated_at: Date.now() })

    log('Cache updated for %s in %dms', repo_path, Date.now() - start)
  } catch (error) {
    log('Failed to refresh status for %s: %s', repo_path, error.message)
    status_cache.set(repo_path, {
      status: _error_status(error),
      merge_state: DEFAULT_MERGE_STATE,
      updated_at: Date.now()
    })
  }
}

/**
 * Re-run repo discovery and diff against cached repo list.
 * Adds/removes entries and notifies via callback.
 */
export async function invalidate_repo_list() {
  if (!_discover_repos_fn) {
    log('Cannot invalidate repo list: no discovery function set')
    return
  }

  log('Re-discovering repo list...')

  const { repo_paths: new_paths, worktree_metadata: new_metadata } =
    await _discover_repos_fn()

  const old_paths = new Set(repo_list_cache?.repo_paths || [])
  const new_paths_set = new Set(new_paths)

  const added = new_paths.filter((p) => !old_paths.has(p))
  const removed = [...old_paths].filter((p) => !new_paths_set.has(p))

  // Update cache
  repo_list_cache = { repo_paths: new_paths, worktree_metadata: new_metadata }

  // Remove stale entries
  for (const repo_path of removed) {
    status_cache.delete(repo_path)
    log('Removed repo from cache: %s', repo_path)
  }

  // Fetch status for new entries
  if (added.length > 0) {
    const now = Date.now()
    await Promise.all(
      added.map(async (repo_path) => {
        try {
          const [status, merge_state] = await Promise.all([
            get_status({ repo_path }),
            _get_merge_state(repo_path)
          ])
          status_cache.set(repo_path, { status, merge_state, updated_at: now })
          log('Added repo to cache: %s', repo_path)
        } catch (error) {
          log(
            'Failed to get status for new repo %s: %s',
            repo_path,
            error.message
          )
          status_cache.set(repo_path, {
            status: _error_status(error),
            merge_state: DEFAULT_MERGE_STATE,
            updated_at: now
          })
        }
      })
    )
  }

  if (added.length > 0 || removed.length > 0) {
    log('Repo list changed: +%d -%d', added.length, removed.length)
    if (_on_repo_list_changed) {
      _on_repo_list_changed({ added, removed })
    }
  }
}

/**
 * Check if the cache is ready to serve requests
 *
 * @returns {boolean}
 */
export function is_cache_ready() {
  return repo_list_cache !== null
}

/**
 * Get cache metadata including oldest updated_at timestamp
 *
 * @returns {{ oldest_updated_at: number|null, repo_count: number }}
 */
export function get_cache_metadata() {
  if (!repo_list_cache) {
    return { oldest_updated_at: null, repo_count: 0 }
  }

  // Compute oldest_updated_at on the fly from individual repo entries
  let oldest = null
  for (const entry of status_cache.values()) {
    if (oldest === null || entry.updated_at < oldest) {
      oldest = entry.updated_at
    }
  }

  return {
    oldest_updated_at: oldest,
    repo_count: status_cache.size
  }
}

/**
 * Get the initialization promise (for callers that arrive during cold start)
 *
 * @returns {Promise|null}
 */
export function get_cache_initializing() {
  return cache_initializing
}

/**
 * Destroy the cache and reset all state
 */
export function destroy_cache() {
  repo_list_cache = null
  status_cache.clear()
  cache_initializing = null
  is_initialized = false
  _discover_repos_fn = null
  _on_repo_list_changed = null
  log('Cache destroyed')
}

/**
 * Get merge state for a repo
 */
async function _get_merge_state(repo_path) {
  try {
    const merging = await is_merging({ repo_path })
    if (merging) {
      const [ours_branch, theirs_branch] = await Promise.all([
        get_current_branch_name({ repo_path }),
        get_merge_head_branch_name({ repo_path })
      ])
      return { is_merging: true, ours_branch, theirs_branch }
    }
  } catch (error) {
    log('Failed to get merge state for %s: %s', repo_path, error.message)
  }
  return DEFAULT_MERGE_STATE
}

/**
 * Generate an error status object for repos that fail to report status
 */
function _error_status(error) {
  return {
    error: error.message,
    branch: null,
    ahead: 0,
    behind: 0,
    has_upstream: false,
    remote_url: null,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
    has_changes: false,
    has_conflicts: false
  }
}
