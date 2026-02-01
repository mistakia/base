import path from 'path'

import debug from 'debug'
import chokidar from 'chokidar'

import { get_known_repositories } from '#server/routes/git.mjs'

const log = debug('file-subscriptions:git-status-watcher')

const DEBOUNCE_MS = 1000

const GIT_WATCH_PATTERNS = [
  '.git/index',
  '.git/HEAD',
  '.git/refs/heads/**',
  '.git/refs/remotes/**',
  '.git/MERGE_HEAD'
]

let watcher = null
const debounce_timers = new Map()

/**
 * Start watching .git internals across all known repositories.
 * @param {Object} params
 * @param {Function} params.on_git_status_change - Callback invoked with { repo_path } on debounced change
 * @param {string[]} [params.repo_paths] - Repository paths to watch (discovered automatically if not provided)
 */
export async function start_git_status_watcher({
  on_git_status_change,
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

  const watch_paths = []
  for (const repo_path of repo_paths) {
    for (const pattern of GIT_WATCH_PATTERNS) {
      watch_paths.push(path.join(repo_path, pattern))
    }
  }

  log('Watching git internals for %d repositories', repo_paths.length)

  try {
    watcher = chokidar.watch(watch_paths, {
      persistent: true,
      ignoreInitial: true
    })

    watcher
      .on('add', (file_path) =>
        handle_change(file_path, repo_paths, on_git_status_change)
      )
      .on('change', (file_path) =>
        handle_change(file_path, repo_paths, on_git_status_change)
      )
      .on('unlink', (file_path) =>
        handle_change(file_path, repo_paths, on_git_status_change)
      )
      .on('error', (error) => {
        log('Git status watcher error: %s', error.message)
      })

    log('Git status watcher started')
    return watcher
  } catch (error) {
    log('Failed to start git status watcher: %s', error.message)
    return null
  }
}

function handle_change(file_path, repo_paths, on_git_status_change) {
  const repo_path = find_repo_for_path(file_path, repo_paths)
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

function find_repo_for_path(file_path, repo_paths) {
  for (const repo_path of repo_paths) {
    const git_dir = path.join(repo_path, '.git')
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

  if (watcher) {
    try {
      await watcher.close()
    } catch (error) {
      log('Error closing watcher: %s', error.message)
    }
    watcher = null
  }

  log('Git status watcher stopped')
}
