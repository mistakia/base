/**
 * Thread Subscription Manager
 *
 * Tracks which WebSocket connections are subscribed to which thread IDs.
 * Mirrors the file subscription pattern in libs-server/file-subscriptions/subscription-manager.mjs.
 * Cleanup is performed via remove_connection() when WebSocket connections close.
 */

import debug from 'debug'

const log = debug('thread-subscriptions:manager')

// Map to store connection -> Set<thread_id> mapping
const thread_subscriptions = new Map()

// Map to track thread_id -> Set<ws> for efficient subscriber lookup
const thread_id_to_subscribers = new Map()

/**
 * Subscribe a WebSocket connection to thread updates
 * @param {Object} params
 * @param {WebSocket} params.ws - The WebSocket connection
 * @param {string} params.thread_id - The thread ID to subscribe to
 */
export function subscribe_to_thread({ ws, thread_id }) {
  if (!ws || !thread_id) return

  // Add to connection's subscription set
  let connection_threads = thread_subscriptions.get(ws)
  if (!connection_threads) {
    connection_threads = new Set()
    thread_subscriptions.set(ws, connection_threads)
  }
  connection_threads.add(thread_id)

  // Add to thread's subscriber set
  let subscribers = thread_id_to_subscribers.get(thread_id)
  if (!subscribers) {
    subscribers = new Set()
    thread_id_to_subscribers.set(thread_id, subscribers)
  }
  subscribers.add(ws)

  log(
    'Subscribed to thread: %s (total subscribers: %d)',
    thread_id,
    subscribers.size
  )
}

/**
 * Unsubscribe a WebSocket connection from thread updates
 * @param {Object} params
 * @param {WebSocket} params.ws - The WebSocket connection
 * @param {string} params.thread_id - The thread ID to unsubscribe from
 */
export function unsubscribe_from_thread({ ws, thread_id }) {
  if (!ws || !thread_id) return

  // Remove from connection's subscription set
  const connection_threads = thread_subscriptions.get(ws)
  if (connection_threads) {
    connection_threads.delete(thread_id)
    if (connection_threads.size === 0) {
      thread_subscriptions.delete(ws)
    }
  }

  // Remove from thread's subscriber set
  const subscribers = thread_id_to_subscribers.get(thread_id)
  if (subscribers) {
    subscribers.delete(ws)
    if (subscribers.size === 0) {
      thread_id_to_subscribers.delete(thread_id)
    }
    log(
      'Unsubscribed from thread: %s (remaining subscribers: %d)',
      thread_id,
      subscribers.size
    )
  }
}

/**
 * Get all WebSocket connections subscribed to a thread
 * @param {string} thread_id - The thread ID to get subscribers for
 * @returns {Set<WebSocket>} Set of WebSocket connections subscribed to this thread
 */
export function get_thread_subscribers(thread_id) {
  if (!thread_id) return new Set()
  return thread_id_to_subscribers.get(thread_id) || new Set()
}

/**
 * Check if a WebSocket connection is subscribed to a thread
 * @param {Object} params
 * @param {WebSocket} params.ws - The WebSocket connection
 * @param {string} params.thread_id - The thread ID to check
 * @returns {boolean} True if the connection is subscribed to the thread
 */
export function is_subscribed_to_thread({ ws, thread_id }) {
  if (!ws || !thread_id) return false
  const connection_threads = thread_subscriptions.get(ws)
  return connection_threads ? connection_threads.has(thread_id) : false
}

/**
 * Remove all thread subscriptions for a WebSocket connection (call on disconnect)
 * @param {WebSocket} ws - The WebSocket connection to clean up
 */
export function remove_connection(ws) {
  if (!ws) return

  const connection_threads = thread_subscriptions.get(ws)
  if (!connection_threads) return

  // Remove this connection from all thread subscriber sets
  for (const thread_id of connection_threads) {
    const subscribers = thread_id_to_subscribers.get(thread_id)
    if (subscribers) {
      subscribers.delete(ws)
      if (subscribers.size === 0) {
        thread_id_to_subscribers.delete(thread_id)
      }
    }
  }

  // Remove the connection's subscription set
  thread_subscriptions.delete(ws)

  log(
    'Removed connection with %d thread subscriptions',
    connection_threads.size
  )
}

/**
 * Get all thread IDs a WebSocket connection is subscribed to
 * @param {WebSocket} ws - The WebSocket connection
 * @returns {Set<string>} Set of thread IDs the connection is subscribed to
 */
export function get_thread_subscriptions(ws) {
  if (!ws) return new Set()
  return thread_subscriptions.get(ws) || new Set()
}
