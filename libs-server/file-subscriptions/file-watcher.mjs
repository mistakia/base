/**
 * File Subscription Watcher
 *
 * Monitor user base directory for file changes using chokidar.
 * Emits targeted events to subscribed WebSocket clients.
 *
 * Uses exclusion-based directory discovery: instead of watching the entire
 * user-base recursively, discovers top-level entity directories at startup
 * and excludes known non-entity directories. This reduces inotify watch
 * descriptors from ~250k to a few hundred on Linux.
 *
 * New entity directories (e.g., recipe/, bookmark/) are automatically picked
 * up on next restart without code changes. New NON-entity directories must be
 * added to the exclusion list in config (file_watchers.subscription_exclude_dirs).
 *
 * See: task/base/fix-file-watcher-scalability.md for full rationale.
 */

import fs from 'fs'
import path from 'path'

import debug from 'debug'
import chokidar from 'chokidar'
import { WebSocket } from 'ws'

import config from '#config'
import { get_file_subscribers } from './subscription-manager.mjs'
import { check_user_permission } from '#server/middleware/permission/index.mjs'
import { create_user_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('file-subscriptions:watcher')

// Directories excluded from file subscription watching because they are either
// covered by dedicated watchers or contain non-entity data. The exclusion-based
// approach means new entity directories are automatically watched without code
// changes. Only add directories here that should NOT be watched.
const DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS = [
  'repository', // covered by git-status-watcher
  'thread', // covered by thread-watcher
  '.git', // internal git data
  'node_modules', // dependencies
  'embedded-database-index', // DuckDB internal files
  'import-history' // git submodule, not live entity data
]

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/*.swp',
  '**/*~',
  '**/.DS_Store'
]

const DEBOUNCE_MS = 500

let file_watcher = null
let is_watching = false
let resolved_watch_paths = []

// Timeout for permission checks to prevent hung operations
const PERMISSION_CHECK_TIMEOUT_MS = 5000

/**
 * Check permission with timeout protection
 * @param {Object} params - Permission check parameters
 * @returns {Promise<Object>} Permission result or timeout error
 */
async function check_permission_with_timeout({
  user_public_key,
  resource_path
}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Permission check timed out')),
      PERMISSION_CHECK_TIMEOUT_MS
    )
    check_user_permission({ user_public_key, resource_path })
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

/**
 * Emit an event to all subscribers of a file path
 * Only sends to subscribers with read permission for the file
 * Uses batched permission checks to avoid N+1 queries
 * @param {string} file_path - The file path (relative to user base)
 * @param {string} event_type - The event type ('FILE_CHANGED' or 'FILE_DELETED')
 * @returns {Promise<number>} Number of clients notified
 */
async function emit_to_subscribers(file_path, event_type) {
  if (!file_path) return 0

  const subscribers = get_file_subscribers(file_path)
  if (subscribers.length === 0) return 0

  const message = JSON.stringify({
    type: event_type,
    payload: { path: file_path }
  })

  // Convert relative path to base URI for permission check
  const resource_path = create_user_uri(file_path)

  // Group subscribers by user_public_key to batch permission checks
  const subscribers_by_user = new Map()
  for (const ws of subscribers) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const key = ws.user_public_key || null
      if (!subscribers_by_user.has(key)) {
        subscribers_by_user.set(key, [])
      }
      subscribers_by_user.get(key).push(ws)
    }
  }

  // Check permission once per unique user and cache results
  const permission_cache = new Map()
  for (const user_public_key of subscribers_by_user.keys()) {
    try {
      const permission = await check_permission_with_timeout({
        user_public_key,
        resource_path
      })
      permission_cache.set(user_public_key, permission)
    } catch (error) {
      log(
        'Permission check error for user %s: %s',
        user_public_key,
        error.message
      )
      permission_cache.set(user_public_key, {
        allowed: false,
        reason: error.message
      })
    }
  }

  // Send to all authorized subscribers
  let sent_count = 0
  let skipped_count = 0

  for (const [user_public_key, ws_list] of subscribers_by_user) {
    const permission = permission_cache.get(user_public_key)

    for (const ws of ws_list) {
      try {
        if (permission.allowed) {
          ws.send(message)
          sent_count++
        } else {
          skipped_count++
        }
      } catch (error) {
        log('Error sending %s: %s', event_type, error.message)
      }
    }

    if (!permission.allowed && ws_list.length > 0) {
      log(
        'Skipped %s for %s to %d unauthorized subscriber(s): %s',
        event_type,
        file_path,
        ws_list.length,
        permission.reason
      )
    }
  }

  log(
    'Emitted %s for %s to %d/%d subscribers (skipped %d unauthorized)',
    event_type,
    file_path,
    sent_count,
    subscribers.length,
    skipped_count
  )
  return sent_count
}

/**
 * Emit a FILE_CHANGED event to all subscribers of a file path
 * @param {string} file_path - The file path that changed (relative to user base)
 * @returns {Promise<number>} Number of clients notified
 */
export async function emit_file_changed(file_path) {
  return emit_to_subscribers(file_path, 'FILE_CHANGED')
}

/**
 * Emit a FILE_DELETED event to all subscribers of a file path
 * @param {string} file_path - The file path that was deleted (relative to user base)
 * @returns {Promise<number>} Number of clients notified
 */
export async function emit_file_deleted(file_path) {
  return emit_to_subscribers(file_path, 'FILE_DELETED')
}

/**
 * Discover entity directories to watch by scanning the user-base top level
 * and excluding known non-entity directories.
 *
 * @param {string} user_base_dir - Absolute path to user base directory
 * @param {Object} [options] - Options
 * @param {string[]|null} [options.explicit_watch_paths] - If set, use these paths instead of auto-discovery
 * @param {string[]} [options.exclude_dirs] - Directories to exclude during auto-discovery
 * @returns {string[]} Array of absolute directory paths to watch
 */
export function discover_watch_paths(
  user_base_dir,
  { explicit_watch_paths = null, exclude_dirs = DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS } = {}
) {
  // Config override: use explicit paths when provided
  if (Array.isArray(explicit_watch_paths)) {
    const resolved = explicit_watch_paths
      .map((relative_path) => path.join(user_base_dir, relative_path))
      .filter((absolute_path) => {
        try {
          const stat = fs.statSync(absolute_path)
          return stat.isDirectory()
        } catch {
          log('Configured watch path does not exist: %s', absolute_path)
          return false
        }
      })
    log('Using explicit watch paths: %o', resolved)
    return resolved
  }

  // Auto-discovery: scan top-level directories, exclude non-entity dirs
  const exclude_set = new Set(exclude_dirs)

  let entries
  try {
    entries = fs.readdirSync(user_base_dir, { withFileTypes: true })
  } catch (error) {
    log('Failed to read user base directory: %s', error.message)
    return []
  }

  const watch_paths = entries
    .filter((entry) => {
      if (!entry.isDirectory()) return false
      if (exclude_set.has(entry.name)) return false
      if (entry.name.startsWith('.')) return false
      return true
    })
    .map((entry) => path.join(user_base_dir, entry.name))

  log(
    'Auto-discovered %d entity directories (excluded: %o): %o',
    watch_paths.length,
    [...exclude_set],
    watch_paths.map((p) => path.basename(p))
  )

  return watch_paths
}

/**
 * Discover git submodule working trees within watched directories.
 * Submodules have a .git FILE (not directory) containing a gitdir pointer.
 * These can contain millions of files and must be excluded from recursive watching.
 *
 * @param {string[]} watch_paths - Absolute paths to watched directories
 * @returns {string[]} Array of glob ignore patterns for discovered submodule directories
 */
function discover_submodule_ignore_patterns(watch_paths) {
  const patterns = []

  for (const watch_path of watch_paths) {
    _find_submodules_recursive(watch_path, watch_path, patterns)
  }

  if (patterns.length > 0) {
    log('Discovered %d submodule ignore patterns: %o', patterns.length, patterns)
  }

  return patterns
}

function _find_submodules_recursive(dir, root, patterns) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.name === '.git' && entry.isFile()) {
      // This directory is a submodule root -- exclude it
      const relative = path.relative(root, dir)
      patterns.push(`**/${path.basename(dir)}/**`)
      log('Found submodule at %s, adding ignore pattern', relative)
      return // Don't recurse into submodules
    }
  }

  // Recurse into subdirectories (skip hidden dirs)
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      _find_submodules_recursive(path.join(dir, entry.name), root, patterns)
    }
  }
}

/**
 * Start the file subscription watcher
 * @param {Object} params
 * @param {Function} params.on_file_add - Callback for new file events (receives relative path)
 * @param {Function} params.on_file_change - Callback for file content change events (receives relative path)
 * @param {Function} params.on_file_delete - Callback for file delete events (receives relative path)
 * @returns {Object|null} The chokidar watcher instance, or null if failed to start
 */
export function start_file_subscription_watcher({
  on_file_add,
  on_file_change,
  on_file_delete
}) {
  if (is_watching) {
    log('File subscription watcher already running')
    return file_watcher
  }

  const user_base_dir = config.user_base_directory
  if (!user_base_dir) {
    log(
      'User base directory not configured, cannot start file subscription watcher'
    )
    return null
  }

  const file_watcher_config = config.file_watchers || {}
  const watch_paths = discover_watch_paths(user_base_dir, {
    explicit_watch_paths: file_watcher_config.subscription_watch_paths || null,
    exclude_dirs:
      file_watcher_config.subscription_exclude_dirs ||
      DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS
  })

  if (watch_paths.length === 0) {
    log('No directories to watch, file subscription watcher not started')
    return null
  }

  log(
    'Starting file subscription watcher for %d directories in %s',
    watch_paths.length,
    user_base_dir
  )

  // Store resolved paths for health endpoint consumption
  resolved_watch_paths = watch_paths.map((p) => path.relative(user_base_dir, p))

  // Detect git submodules within watched directories and add ignore patterns.
  // Submodule working trees can contain millions of files (e.g., transparency-act)
  // which would exhaust inotify watches on Linux.
  const submodule_patterns = discover_submodule_ignore_patterns(watch_paths)
  const all_ignore_patterns = [...IGNORE_PATTERNS, ...submodule_patterns]

  try {
    file_watcher = chokidar.watch(watch_paths, {
      persistent: true,
      ignoreInitial: true,
      ignored: all_ignore_patterns,
      awaitWriteFinish: {
        stabilityThreshold: DEBOUNCE_MS,
        pollInterval: 100
      }
    })

    file_watcher
      .on('add', (absolute_path) => {
        const relative_path = path.relative(user_base_dir, absolute_path)
        log('File added: %s', relative_path)
        if (typeof on_file_add === 'function') on_file_add(relative_path)
      })
      .on('change', (absolute_path) => {
        const relative_path = path.relative(user_base_dir, absolute_path)
        log('File changed: %s', relative_path)
        if (typeof on_file_change === 'function') on_file_change(relative_path)
      })
      .on('unlink', (absolute_path) => {
        const relative_path = path.relative(user_base_dir, absolute_path)
        log('File deleted: %s', relative_path)
        if (typeof on_file_delete === 'function') on_file_delete(relative_path)
      })
      .on('error', (error) => {
        log('File watcher error: %s', error.message)
      })

    is_watching = true
    log('File subscription watcher started')

    return file_watcher
  } catch (error) {
    log('Failed to start file subscription watcher: %s', error.message)
    is_watching = false
    return null
  }
}

/**
 * Get the resolved watch paths (relative to user base directory).
 * Used by the health endpoint to report which directories are being watched.
 * @returns {string[]} Array of relative directory paths
 */
export function get_watched_paths() {
  return resolved_watch_paths
}

/**
 * Stop the file subscription watcher
 * @returns {Promise<void>}
 */
export async function stop_file_subscription_watcher() {
  log('Stopping file subscription watcher')

  if (file_watcher) {
    await file_watcher.close()
    file_watcher = null
  }

  is_watching = false
  resolved_watch_paths = []
  log('File subscription watcher stopped')
}

export { DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS }
