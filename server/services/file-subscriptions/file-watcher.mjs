/**
 * File Subscription Watcher
 *
 * Emits targeted events to subscribed WebSocket clients when files change.
 * Actual file watching is handled by the consolidated user-base-watcher;
 * this module provides event emission with permission checking.
 *
 * See: task/base/reduce-inotify-watch-count.md for migration details.
 */

import debug from 'debug'
import { WebSocket } from 'ws'

import config from '#config'
import { get_file_subscribers } from '#libs-server/file-subscriptions/subscription-manager.mjs'
import { check_user_permission } from '#server/middleware/permission/index.mjs'
import { create_user_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('file-subscriptions:watcher')

let is_watching = false

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
  if (!is_watching) return 0
  return emit_to_subscribers(file_path, 'FILE_CHANGED')
}

/**
 * Emit a FILE_DELETED event to all subscribers of a file path
 * @param {string} file_path - The file path that was deleted (relative to user base)
 * @returns {Promise<number>} Number of clients notified
 */
export async function emit_file_deleted(file_path) {
  if (!is_watching) return 0
  return emit_to_subscribers(file_path, 'FILE_DELETED')
}

/**
 * Start the file subscription watcher.
 * Actual file watching is handled by the consolidated user-base-watcher
 * which routes events to emit_file_changed/emit_file_deleted.
 *
 * @returns {boolean} True if setup succeeded
 */
export function start_file_subscription_watcher() {
  if (is_watching) {
    log('File subscription watcher already running')
    return true
  }

  const user_base_dir = config.user_base_directory
  if (!user_base_dir) {
    log(
      'User base directory not configured, cannot start file subscription watcher'
    )
    return false
  }

  is_watching = true
  log('File subscription watcher initialized (watching via user-base-watcher)')
  return true
}

/**
 * Stop the file subscription watcher
 */
export function stop_file_subscription_watcher() {
  log('Stopping file subscription watcher')
  is_watching = false
  log('File subscription watcher stopped')
}
