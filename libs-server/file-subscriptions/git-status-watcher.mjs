import path from 'path'
import fs from 'fs/promises'

import debug from 'debug'
import chokidar from 'chokidar'

import { get_known_repositories } from '#server/routes/git.mjs'

const log = debug('file-subscriptions:git-status-watcher')

const DEBOUNCE_MS = 1000

// Relative patterns within the actual .git directory
const GIT_WATCH_PATTERNS = [
  'index',
  'HEAD',
  'refs/heads/**',
  'refs/remotes/**',
  'MERGE_HEAD'
]

const REPO_LIST_WATCH_PATTERNS = ['.gitmodules', '.git/worktrees/**']

let watcher = null
let repo_list_watcher = null
const debounce_timers = new Map()
let current_repo_paths = [] // source of truth for repo-path lookups in handle_change
const git_dir_to_repo_path = new Map() // maps actual git dir -> repo path (for worktree reverse lookup)

/**
 * Get the actual git directory for a repository.
 * For worktrees, .git is a file containing "gitdir: /path/to/parent/.git/worktrees/<name>"
 * For regular repos, .git is a directory.
 *
 * @param {string} repo_path - Repository path
 * @returns {Promise<{git_dir: string, is_worktree: boolean}>}
 */
async function get_git_dir_for_repo(repo_path) {
  const git_path = path.join(repo_path, '.git')

  try {
    const stats = await fs.stat(git_path)

    if (stats.isDirectory()) {
      // Regular repo - .git is a directory
      return { git_dir: git_path, is_worktree: false }
    }

    if (stats.isFile()) {
      // Worktree - .git is a file with gitdir pointer
      const content = await fs.readFile(git_path, 'utf-8')
      const match = content.match(/^gitdir:\s*(.+)$/m)
      if (match) {
        let actual_git_dir = match[1].trim()
        // Handle relative paths (relative to repo_path)
        if (!path.isAbsolute(actual_git_dir)) {
          actual_git_dir = path.resolve(repo_path, actual_git_dir)
        }
        return { git_dir: actual_git_dir, is_worktree: true }
      }
    }
  } catch (error) {
    log('Failed to get git dir for %s: %s', repo_path, error.message)
  }

  // Fallback to standard path
  return { git_dir: git_path, is_worktree: false }
}

/**
 * Start watching .git internals across all known repositories.
 * @param {Object} params
 * @param {Function} params.on_git_status_change - Callback invoked with { repo_path } on debounced change
 * @param {Function} [params.on_repo_list_change] - Callback invoked when .gitmodules or worktrees change
 * @param {string[]} [params.repo_paths] - Repository paths to watch (discovered automatically if not provided)
 * @returns {Promise<Object|null>} Chokidar watcher instance or null if initialization fails
 */
export async function start_git_status_watcher({
  on_git_status_change,
  on_repo_list_change,
  repo_paths: provided_repo_paths
}) {
  if (watcher) {
    log('Git status watcher already running')
    return watcher
  }

  let repo_paths = provided_repo_paths
  if (!repo_paths) {
    try {
      const result = await get_known_repositories()
      repo_paths = result.repo_paths
    } catch (error) {
      log('Failed to discover repositories: %s', error.message)
      return null
    }
  }

  if (!repo_paths?.length) {
    log('No repositories found to watch')
    return null
  }

  current_repo_paths = [...repo_paths]
  git_dir_to_repo_path.clear()

  // Build watch paths for git status changes
  // For each repo, resolve the actual .git directory (handles worktrees)
  const watch_paths = []
  const git_dir_results = await Promise.all(
    repo_paths.map(async (repo_path) => {
      const result = await get_git_dir_for_repo(repo_path)
      return { repo_path, ...result }
    })
  )

  for (const { repo_path, git_dir, is_worktree } of git_dir_results) {
    // Map git_dir back to repo_path for reverse lookup in handle_change
    git_dir_to_repo_path.set(git_dir, repo_path)

    for (const pattern of GIT_WATCH_PATTERNS) {
      watch_paths.push(path.join(git_dir, pattern))
    }

    if (is_worktree) {
      log('Worktree %s -> git dir %s', repo_path, git_dir)
    }
  }

  log('Watching git internals for %d repositories', repo_paths.length)

  try {
    watcher = chokidar.watch(watch_paths, {
      persistent: true,
      ignoreInitial: true
    })

    watcher
      .on('add', (file_path) => handle_change(file_path, on_git_status_change))
      .on('change', (file_path) =>
        handle_change(file_path, on_git_status_change)
      )
      .on('unlink', (file_path) =>
        handle_change(file_path, on_git_status_change)
      )
      .on('error', (error) => {
        log('Git status watcher error: %s', error.message)
      })

    // Start repo list watcher (watches .gitmodules and worktree changes)
    if (on_repo_list_change) {
      _start_repo_list_watcher(repo_paths, on_repo_list_change)
    }

    log('Git status watcher started')
    return watcher
  } catch (error) {
    log('Failed to start git status watcher: %s', error.message)
    return null
  }
}

/**
 * Start watching for repo list changes (.gitmodules, worktree additions/removals)
 */
function _start_repo_list_watcher(repo_paths, on_repo_list_change) {
  const repo_list_watch_paths = []
  for (const repo_path of repo_paths) {
    for (const pattern of REPO_LIST_WATCH_PATTERNS) {
      repo_list_watch_paths.push(path.join(repo_path, pattern))
    }
  }

  try {
    repo_list_watcher = chokidar.watch(repo_list_watch_paths, {
      persistent: true,
      ignoreInitial: true
    })

    let repo_list_debounce_timer = null

    const handle_repo_list_change = () => {
      if (repo_list_debounce_timer) {
        clearTimeout(repo_list_debounce_timer)
      }
      repo_list_debounce_timer = setTimeout(() => {
        repo_list_debounce_timer = null
        log('Repo list change detected')
        try {
          on_repo_list_change()
        } catch (error) {
          log('Error in repo list change callback: %s', error.message)
        }
      }, DEBOUNCE_MS)
    }

    repo_list_watcher
      .on('add', handle_repo_list_change)
      .on('change', handle_repo_list_change)
      .on('unlink', handle_repo_list_change)
      .on('error', (error) => {
        log('Repo list watcher error: %s', error.message)
      })

    log('Repo list watcher started')
  } catch (error) {
    log('Failed to start repo list watcher: %s', error.message)
  }
}

/**
 * Add a repository to the watcher dynamically
 * @param {string} repo_path - Repository path to start watching
 */
export async function add_repo_to_watcher(repo_path) {
  if (!watcher) {
    log('Cannot add repo: watcher not running')
    return
  }

  if (current_repo_paths.includes(repo_path)) {
    log('Repo already being watched: %s', repo_path)
    return
  }

  current_repo_paths.push(repo_path)

  // Get the actual git directory (handles worktrees)
  const { git_dir, is_worktree } = await get_git_dir_for_repo(repo_path)
  git_dir_to_repo_path.set(git_dir, repo_path)

  for (const pattern of GIT_WATCH_PATTERNS) {
    watcher.add(path.join(git_dir, pattern))
  }

  // Also update repo_list_watcher to monitor .gitmodules and worktrees for this repo
  if (repo_list_watcher) {
    for (const pattern of REPO_LIST_WATCH_PATTERNS) {
      repo_list_watcher.add(path.join(repo_path, pattern))
    }
  }

  log(
    'Added repo to watcher: %s%s',
    repo_path,
    is_worktree ? ` (worktree -> ${git_dir})` : ''
  )
}

/**
 * Remove a repository from the watcher dynamically
 * @param {string} repo_path - Repository path to stop watching
 */
export async function remove_repo_from_watcher(repo_path) {
  if (!watcher) {
    log('Cannot remove repo: watcher not running')
    return
  }

  const index = current_repo_paths.indexOf(repo_path)
  if (index === -1) {
    log('Repo not being watched: %s', repo_path)
    return
  }

  current_repo_paths.splice(index, 1)

  // Get the git directory for this repo and remove from mapping
  const { git_dir } = await get_git_dir_for_repo(repo_path)
  git_dir_to_repo_path.delete(git_dir)

  for (const pattern of GIT_WATCH_PATTERNS) {
    watcher.unwatch(path.join(git_dir, pattern))
  }

  // Also remove from repo_list_watcher
  if (repo_list_watcher) {
    for (const pattern of REPO_LIST_WATCH_PATTERNS) {
      repo_list_watcher.unwatch(path.join(repo_path, pattern))
    }
  }

  // Clean up any pending debounce timer
  if (debounce_timers.has(repo_path)) {
    clearTimeout(debounce_timers.get(repo_path))
    debounce_timers.delete(repo_path)
  }

  log('Removed repo from watcher: %s', repo_path)
}

function handle_change(file_path, on_git_status_change) {
  const repo_path = find_repo_for_path(file_path)
  if (!repo_path) return

  log('Git change detected in %s: %s', repo_path, file_path)

  if (debounce_timers.has(repo_path)) {
    clearTimeout(debounce_timers.get(repo_path))
  }

  debounce_timers.set(
    repo_path,
    setTimeout(() => {
      debounce_timers.delete(repo_path)
      log('Emitting git status change for %s', repo_path)
      try {
        on_git_status_change({ repo_path })
      } catch (error) {
        log('Error in git status change callback: %s', error.message)
      }
    }, DEBOUNCE_MS)
  )
}

/**
 * Find the repository path for a changed file.
 * Uses the git_dir_to_repo_path mapping for worktrees.
 *
 * @param {string} file_path - Changed file path
 * @returns {string|null} Repository path or null
 */
function find_repo_for_path(file_path) {
  // Check against all known git directories (handles worktrees)
  for (const [git_dir, repo_path] of git_dir_to_repo_path.entries()) {
    if (file_path.startsWith(git_dir + path.sep) || file_path === git_dir) {
      return repo_path
    }
  }
  return null
}

export async function stop_git_status_watcher() {
  log('Stopping git status watcher')

  for (const timer of debounce_timers.values()) {
    clearTimeout(timer)
  }
  debounce_timers.clear()

  if (repo_list_watcher) {
    try {
      await repo_list_watcher.close()
    } catch (error) {
      log('Error closing repo list watcher: %s', error.message)
    }
    repo_list_watcher = null
  }

  if (watcher) {
    try {
      await watcher.close()
    } catch (error) {
      log('Error closing watcher: %s', error.message)
    }
    watcher = null
  }

  current_repo_paths = []
  git_dir_to_repo_path.clear()

  log('Git status watcher stopped')
}
