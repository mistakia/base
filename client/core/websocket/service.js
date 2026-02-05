/* global WebSocket, setInterval, clearInterval */

import qs from 'qs'

import { WEBSOCKET_URL } from '@core/constants'
import StoreRegistry from '@core/store-registry'
import { normalize_file_path } from '#libs-shared/path-utils.mjs'

import { websocket_actions } from './actions'

export let ws = null
let messages = []
let interval = null

// Track active file subscriptions for reconnection
const active_file_subscriptions = new Set()

// Track active thread subscriptions for reconnection
const active_thread_subscriptions = new Set()

const keepalive_message = JSON.stringify({ type: 'KEEPALIVE' })
const keepalive = () => {
  if (ws && ws.readyState === 1) ws.send(keepalive_message)
}

/**
 * Re-subscribe to all active file subscriptions after reconnection
 */
const resubscribe_to_files = () => {
  for (const path of active_file_subscriptions) {
    const message = { type: 'SUBSCRIBE_FILE', payload: { path } }
    send(message)
  }
}

/**
 * Re-subscribe to all active thread subscriptions after reconnection
 */
const resubscribe_to_threads = () => {
  for (const thread_id of active_thread_subscriptions) {
    const message = { type: 'SUBSCRIBE_THREAD', payload: { thread_id } }
    send(message)
  }
}

export const open_websocket = (params) => {
  if (ws && ws.close) ws.close()
  console.log('connecting to websocket...')
  ws = new WebSocket(`${WEBSOCKET_URL}?${qs.stringify(params)}`)

  ws.onopen = () => {
    const store = StoreRegistry.getStore()
    console.log('connected to websocket')
    store.dispatch(websocket_actions.open())
    messages.forEach((msg) => ws.send(JSON.stringify(msg)))
    messages = []

    // Re-subscribe to all active subscriptions
    resubscribe_to_files()
    resubscribe_to_threads()

    interval = setInterval(keepalive, 30000)

    ws.onclose = () => {
      const store = StoreRegistry.getStore()
      console.log('disconnected from websocket')
      store.dispatch(websocket_actions.close())
      clearInterval(interval)
    }
  }

  ws.onmessage = (event) => {
    try {
      const store = StoreRegistry.getStore()
      const message = JSON.parse(event.data)
      console.log(`websocket message: ${message.type}`)
      store.dispatch(message)
    } catch (error) {
      console.error('WebSocket message error:', error.message)
    }
  }
}

export const close_websocket = () => {
  ws.close()
  ws = null
}

export const send = (message) => {
  if (!ws || ws.readyState !== 1) messages.push(message)
  else ws.send(JSON.stringify(message))
}

export const websocket_is_open = () => ws && ws.readyState === 1

/**
 * Subscribe to file change notifications for a specific path
 * Only sends subscription message if WebSocket is connected (resubscribe_to_files handles reconnection)
 * @param {string} path - The file path to subscribe to (relative to user base)
 */
export const subscribe_to_file = (path) => {
  if (!path) return

  const normalized_path = normalize_file_path(path)
  const already_subscribed = active_file_subscriptions.has(normalized_path)
  active_file_subscriptions.add(normalized_path)

  // Only send if connected and not already subscribed (avoids duplicates)
  if (websocket_is_open() && !already_subscribed) {
    ws.send(
      JSON.stringify({
        type: 'SUBSCRIBE_FILE',
        payload: { path: normalized_path }
      })
    )
  }
}

/**
 * Unsubscribe from file change notifications for a specific path
 * Only sends unsubscribe message if WebSocket is connected
 * @param {string} path - The file path to unsubscribe from
 */
export const unsubscribe_from_file = (path) => {
  if (!path) return

  const normalized_path = normalize_file_path(path)
  const was_subscribed = active_file_subscriptions.has(normalized_path)
  active_file_subscriptions.delete(normalized_path)

  // Only send if connected and was actually subscribed
  if (websocket_is_open() && was_subscribed) {
    ws.send(
      JSON.stringify({
        type: 'UNSUBSCRIBE_FILE',
        payload: { path: normalized_path }
      })
    )
  }
}

/**
 * Subscribe to thread timeline updates for a specific thread
 * Subscribed threads receive full timeline entry payloads via WebSocket.
 * Non-subscribed threads only receive truncated summaries.
 * @param {string} thread_id - The thread ID to subscribe to
 */
export const subscribe_to_thread = (thread_id) => {
  if (!thread_id) return

  const already_subscribed = active_thread_subscriptions.has(thread_id)
  active_thread_subscriptions.add(thread_id)

  if (websocket_is_open() && !already_subscribed) {
    ws.send(
      JSON.stringify({
        type: 'SUBSCRIBE_THREAD',
        payload: { thread_id }
      })
    )
  }
}

/**
 * Unsubscribe from thread timeline updates
 * @param {string} thread_id - The thread ID to unsubscribe from
 */
export const unsubscribe_from_thread = (thread_id) => {
  if (!thread_id) return

  const was_subscribed = active_thread_subscriptions.has(thread_id)
  active_thread_subscriptions.delete(thread_id)

  if (websocket_is_open() && was_subscribed) {
    ws.send(
      JSON.stringify({
        type: 'UNSUBSCRIBE_THREAD',
        payload: { thread_id }
      })
    )
  }
}
