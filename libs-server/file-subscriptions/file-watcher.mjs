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

/**
 * Emit an event to all subscribers of a file path
 * @param {string} file_path - The file path (relative to user base)
 * @param {string} event_type - The event type ('FILE_CHANGED' or 'FILE_DELETED')
 * @returns {number} Number of clients notified
 */
function emit_to_subscribers(file_path, event_type) {
  if (!file_path) return 0

  const subscribers = get_file_subscribers(file_path)
  const message = JSON.stringify({
    type: event_type,
    payload: { path: file_path }
  })
  let sent_count = 0

  for (const ws of subscribers) {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message)
        sent_count++
      }
    } catch (error) {
      log('Error sending %s: %s', event_type, error.message)
    }
  }

  log(
    'Emitted %s for %s to %d/%d subscribers',
    event_type,
    file_path,
    sent_count,
    subscribers.length
  )
  return sent_count
}

/**
 * Emit a FILE_CHANGED event to all subscribers of a file path
 * @param {string} file_path - The file path that changed (relative to user base)
 * @returns {number} Number of clients notified
 */
export function emit_file_changed(file_path) {
  return emit_to_subscribers(file_path, 'FILE_CHANGED')
}

/**
 * Emit a FILE_DELETED event to all subscribers of a file path
 * @param {string} file_path - The file path that was deleted (relative to user base)
 * @returns {number} Number of clients notified
 */
export function emit_file_deleted(file_path) {
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
