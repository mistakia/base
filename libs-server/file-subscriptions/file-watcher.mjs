/**
 * File Subscription Watcher
 *
 * Monitor user base directory for file changes using chokidar.
 * Emits targeted events to subscribed WebSocket clients.
 */

import path from 'path'

import debug from 'debug'
import chokidar from 'chokidar'
import { WebSocket } from 'ws'

import config from '#config'
import { get_file_subscribers } from './subscription-manager.mjs'
import { check_user_permission } from '#server/middleware/permission/index.mjs'
import { create_user_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('file-subscriptions:watcher')

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/thread/**',
  '**/*.swp',
  '**/*~',
  '**/.DS_Store'
]

const DEBOUNCE_MS = 500

let file_watcher = null
let is_watching = false

// Timeout for permission checks to prevent hung operations
const PERMISSION_CHECK_TIMEOUT_MS = 5000

/**
 * Check permission with timeout protection
 * @param {Object} params - Permission check parameters
 * @returns {Promise<Object>} Permission result or timeout error
 */
async function check_permission_with_timeout({ user_public_key, resource_path }) {
  const timeout_promise = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error('Permission check timed out')),
      PERMISSION_CHECK_TIMEOUT_MS
    )
  })

  return Promise.race([
    check_user_permission({ user_public_key, resource_path }),
    timeout_promise
  ])
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
      log('Permission check error for user %s: %s', user_public_key, error.message)
      permission_cache.set(user_public_key, { allowed: false, reason: error.message })
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

  log('Starting file subscription watcher for %s', user_base_dir)

  try {
    file_watcher = chokidar.watch(`${user_base_dir}/**/*`, {
      persistent: true,
      ignoreInitial: true,
      ignored: IGNORE_PATTERNS,
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
  log('File subscription watcher stopped')
}
