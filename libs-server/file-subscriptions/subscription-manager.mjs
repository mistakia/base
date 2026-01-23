/**
 * File Subscription Manager
 *
 * Tracks which WebSocket connections are subscribed to which file paths.
 * Cleanup is performed via remove_connection() when WebSocket connections close.
 */

import debug from 'debug'

import { normalize_file_path } from '#libs-shared/path-utils.mjs'

const log = debug('file-subscriptions:manager')

// Map to store connection -> Set<path> mapping
const file_subscriptions = new Map()

// Map to track path -> Set<ws> for efficient subscriber lookup
const path_to_subscribers = new Map()

/**
 * Subscribe a WebSocket connection to file change notifications for a path
 * @param {Object} params
 * @param {WebSocket} params.ws - The WebSocket connection
 * @param {string} params.path - The file path to subscribe to (relative to user base)
 */
export function subscribe_to_file({ ws, path }) {
  if (!ws || !path) return

  const normalized_path = normalize_file_path(path)

  // Add to connection's subscription set
  let connection_paths = file_subscriptions.get(ws)
  if (!connection_paths) {
    connection_paths = new Set()
    file_subscriptions.set(ws, connection_paths)
  }
  connection_paths.add(normalized_path)

  // Add to path's subscriber set
  let subscribers = path_to_subscribers.get(normalized_path)
  if (!subscribers) {
    subscribers = new Set()
    path_to_subscribers.set(normalized_path, subscribers)
  }
  subscribers.add(ws)

  log('Subscribed to file: %s (total subscribers: %d)', normalized_path, subscribers.size)
}

/**
 * Unsubscribe a WebSocket connection from file change notifications for a path
 * @param {Object} params
 * @param {WebSocket} params.ws - The WebSocket connection
 * @param {string} params.path - The file path to unsubscribe from
 */
export function unsubscribe_from_file({ ws, path }) {
  if (!ws || !path) return

  const normalized_path = normalize_file_path(path)

  // Remove from connection's subscription set
  const connection_paths = file_subscriptions.get(ws)
  if (connection_paths) {
    connection_paths.delete(normalized_path)
  }

  // Remove from path's subscriber set
  const subscribers = path_to_subscribers.get(normalized_path)
  if (subscribers) {
    subscribers.delete(ws)
    // Clean up empty sets
    if (subscribers.size === 0) {
      path_to_subscribers.delete(normalized_path)
    }
    log('Unsubscribed from file: %s (remaining subscribers: %d)', normalized_path, subscribers.size)
  }
}

/**
 * Get all WebSocket connections subscribed to a file path
 * @param {string} path - The file path to get subscribers for
 * @returns {WebSocket[]} Array of WebSocket connections subscribed to this path
 */
export function get_file_subscribers(path) {
  if (!path) return []

  const normalized_path = normalize_file_path(path)
  const subscribers = path_to_subscribers.get(normalized_path)
  return subscribers ? Array.from(subscribers) : []
}

/**
 * Remove all subscriptions for a WebSocket connection (call on disconnect)
 * @param {WebSocket} ws - The WebSocket connection to clean up
 */
export function remove_connection(ws) {
  if (!ws) return

  const connection_paths = file_subscriptions.get(ws)
  if (!connection_paths) return

  // Remove this connection from all path subscriber sets
  for (const path of connection_paths) {
    const subscribers = path_to_subscribers.get(path)
    if (subscribers) {
      subscribers.delete(ws)
      if (subscribers.size === 0) {
        path_to_subscribers.delete(path)
      }
    }
  }

  // Remove the connection's subscription set
  file_subscriptions.delete(ws)

  log('Removed connection with %d subscriptions', connection_paths.size)
}

/**
 * Get all paths a WebSocket connection is subscribed to
 * @param {WebSocket} ws - The WebSocket connection
 * @returns {Set<string>} Set of file paths the connection is subscribed to
 */
export function get_subscriptions(ws) {
  if (!ws) return new Set()
  return file_subscriptions.get(ws) || new Set()
}
