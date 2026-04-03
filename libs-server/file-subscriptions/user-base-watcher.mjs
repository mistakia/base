/**
 * User-Base Watcher
 *
 * Single @parcel/watcher subscription for the user-base directory,
 * replacing three separate chokidar instances:
 *   - file_subscription_watcher (entity WebSocket notifications)
 *   - entity_file_watcher (embedded index sync)
 *   - repo_file_watcher (git status detection for unstaged changes)
 *
 * Events are routed by path to the appropriate consumer callbacks.
 *
 * See: task/base/reduce-inotify-watch-count.md
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { create_parcel_subscription } from './parcel-watcher-adapter.mjs'
import { ENTITY_DIRECTORIES } from '#libs-server/embedded-database-index/sync/index-sync-filters.mjs'

const log = debug('file-subscriptions:user-base-watcher')

const RECONCILIATION_DEBOUNCE_MS = 5000
const RECONCILIATION_COOLDOWN_MS = 60000
let reconciliation_timer = null
let is_reconciling = false
let last_reconciliation_completed_at = 0

// Directories ignored by @parcel/watcher subscription.
// These are either covered by dedicated watchers or contain non-entity data.
// Reducing scope reduces FSEvents kernel buffer pressure on macOS.
const USER_BASE_IGNORE = [
  // Ignore at any depth
  '**/dist',
  '**/build',
  '**/.cache',
  '**/coverage',
  '**/tmp',
  '**/.turbo',
  '**/.next',
  '**/archive',
  // Ignore at user-base root only (covered by dedicated watchers or non-entity)
  'thread',
  'import-history',
  'embedded-database-index',
  // Non-entity data directories (frequent writes, no entity content)
  'database',
  'data',
  'files'
]

// Directories excluded from file subscription event routing.
// Events in these directories are NOT sent to file subscription consumers.
// Note: 'repository' is handled separately (routed to repo_file handler).
const FILE_SUBSCRIPTION_EXCLUDE_DIRS = new Set([
  'repository',
  'thread',
  '.git',
  'node_modules',
  'embedded-database-index',
  'import-history'
])

// Pre-compute entity directory set for fast lookup
const ENTITY_DIR_SET = new Set(ENTITY_DIRECTORIES)

let subscription = null

/**
 * Start the consolidated user-base watcher.
 *
 * @param {Object} params
 * @param {string} params.user_base_directory - Absolute path to user-base directory
 * @param {Object} params.file_subscription - File subscription event callbacks
 * @param {Function} params.file_subscription.on_add - (relative_path) => void
 * @param {Function} params.file_subscription.on_change - (relative_path) => void
 * @param {Function} params.file_subscription.on_delete - (relative_path) => void
 * @param {Object} [params.entity_index] - Entity index sync callbacks
 * @param {Function} params.entity_index.on_change - (absolute_path) => void
 * @param {Function} params.entity_index.on_delete - (absolute_path) => void
 * @param {Object} [params.repo_file] - Repo file change callback
 * @param {Function} params.repo_file.on_change - (absolute_path) => void
 * @returns {Promise<Object>} Subscription handle with unsubscribe()
 */
export async function start_user_base_watcher({
  user_base_directory,
  file_subscription,
  entity_index,
  repo_file
}) {
  if (subscription) {
    log('User-base watcher already running')
    return subscription
  }

  log('Starting user-base watcher for %s', user_base_directory)

  subscription = await create_parcel_subscription({
    directory: user_base_directory,
    ignore: USER_BASE_IGNORE,
    on_events: (events) => {
      for (const event of events) {
        try {
          route_event({
            absolute_path: event.path,
            event_type: event.type,
            user_base_directory,
            file_subscription,
            entity_index,
            repo_file
          })
        } catch (error) {
          log(
            'Error routing event %s %s: %s',
            event.type,
            event.path,
            error.message
          )
        }
      }
    },
    on_error: () => {
      log('FSEvents error received, scheduling entity reconciliation')
      schedule_reconciliation({ user_base_directory, entity_index })
    }
  })

  log('User-base watcher started')
  return subscription
}

/**
 * Route a single event to the appropriate consumer(s).
 */
function route_event({
  absolute_path,
  event_type,
  user_base_directory,
  file_subscription,
  entity_index,
  repo_file
}) {
  const relative_path = path.relative(user_base_directory, absolute_path)
  const first_segment = relative_path.split(path.sep)[0]

  // Route repository/active/* events to repo file handler
  if (first_segment === 'repository') {
    if (repo_file) {
      repo_file.on_change(absolute_path)
    }
    return
  }

  // Skip excluded directories for file subscription events
  if (FILE_SUBSCRIPTION_EXCLUDE_DIRS.has(first_segment)) {
    return
  }

  // Skip hidden directories
  if (first_segment.startsWith('.')) {
    return
  }

  // File subscription events (WebSocket notifications for all entity files)
  if (file_subscription) {
    switch (event_type) {
      case 'create':
        file_subscription.on_add(relative_path)
        break
      case 'update':
        file_subscription.on_change(relative_path)
        break
      case 'delete':
        file_subscription.on_delete(relative_path)
        break
    }
  }

  // Entity index events (embedded database sync for .md files in entity dirs)
  if (
    entity_index &&
    ENTITY_DIR_SET.has(first_segment) &&
    relative_path.endsWith('.md')
  ) {
    switch (event_type) {
      case 'create':
      case 'update':
        entity_index.on_change(absolute_path)
        break
      case 'delete':
        entity_index.on_delete(absolute_path)
        break
    }
  }
}

/**
 * Scan entity directories for .md files and re-emit change events.
 * Called when FSEvents drops events so the entity index can catch up.
 */
async function reconcile_entity_directories({
  user_base_directory,
  entity_index
}) {
  if (!entity_index || is_reconciling) {
    return
  }

  const elapsed = Date.now() - last_reconciliation_completed_at
  if (elapsed < RECONCILIATION_COOLDOWN_MS) {
    log(
      'Skipping reconciliation, last completed %ds ago (cooldown: %ds)',
      Math.round(elapsed / 1000),
      RECONCILIATION_COOLDOWN_MS / 1000
    )
    return
  }

  is_reconciling = true
  log('Starting entity reconciliation scan')
  let file_count = 0

  try {
    for (const dir_name of ENTITY_DIRECTORIES) {
      const dir_path = path.join(user_base_directory, dir_name)
      try {
        const entries = await fs.readdir(dir_path, {
          withFileTypes: true,
          recursive: true
        })
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            const file_path = path.join(entry.parentPath, entry.name)
            entity_index.on_change(file_path)
            file_count++
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          log('Error scanning %s: %s', dir_name, error.message)
        }
      }
      // Yield to event loop between directories to avoid blocking
      await new Promise((resolve) => setImmediate(resolve))
    }
  } finally {
    is_reconciling = false
    last_reconciliation_completed_at = Date.now()
  }

  log('Entity reconciliation complete: %d files re-emitted', file_count)
}

/**
 * Schedule a debounced reconciliation scan for entity directories.
 * Coalesces rapid FSEvents error bursts into a single scan.
 */
function schedule_reconciliation(params) {
  if (reconciliation_timer) {
    clearTimeout(reconciliation_timer)
  }

  reconciliation_timer = setTimeout(() => {
    reconciliation_timer = null
    reconcile_entity_directories(params).catch((error) => {
      log('Reconciliation scan failed: %s', error.message)
    })
  }, RECONCILIATION_DEBOUNCE_MS)
}

/**
 * Stop the user-base watcher.
 * @returns {Promise<void>}
 */
export async function stop_user_base_watcher() {
  if (!subscription) {
    log('No user-base watcher to stop')
    return
  }

  log('Stopping user-base watcher')

  if (reconciliation_timer) {
    clearTimeout(reconciliation_timer)
    reconciliation_timer = null
  }

  await subscription.unsubscribe()
  subscription = null
  log('User-base watcher stopped')
}
