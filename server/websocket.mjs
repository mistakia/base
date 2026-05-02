import { WebSocket, WebSocketServer } from 'ws'
import debug from 'debug'

import {
  subscribe_to_file,
  unsubscribe_from_file,
  remove_connection as remove_file_connection
} from '#libs-server/file-subscriptions/index.mjs'
import {
  subscribe_to_thread,
  unsubscribe_from_thread,
  remove_connection as remove_thread_connection
} from '#libs-server/thread-subscriptions/index.mjs'

const log = debug('websocket')

const HEARTBEAT_INTERVAL_MS = 30000

const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      level: 6
    },
    threshold: 1024
  }
})

const remove_all_subscriptions = (ws) => {
  remove_file_connection(ws)
  remove_thread_connection(ws)
}

// Heartbeat: detect and clean up dead connections
const heartbeat_interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.is_alive === false) {
      log('Terminating unresponsive WebSocket connection')
      remove_all_subscriptions(ws)
      return ws.terminate()
    }

    ws.is_alive = false
    ws.ping()
  })
}, HEARTBEAT_INTERVAL_MS)

// Don't block process exit on this timer alone. The base-api service stays
// alive via the HTTP/WebSocket server handles; CLI flows that transitively
// import this module (via thread creation) must be free to exit.
heartbeat_interval.unref?.()

wss.on('close', () => {
  clearInterval(heartbeat_interval)
})

// Handle new WebSocket connections
wss.on('connection', (ws) => {
  ws.is_alive = true

  ws.on('pong', () => {
    ws.is_alive = true
  })

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString())

      const user_public_key = ws.user_public_key || null

      switch (message.type) {
        case 'SUBSCRIBE_FILE':
          if (message.payload?.path) {
            const allowed = await subscribe_to_file({
              ws,
              path: message.payload.path,
              user_public_key
            })
            if (allowed) {
              log('Client subscribed to file: %s', message.payload.path)
            } else {
              ws.send(
                JSON.stringify({
                  type: 'SUBSCRIPTION_DENIED',
                  payload: {
                    resource_type: 'file',
                    path: message.payload.path
                  }
                })
              )
            }
          }
          break

        case 'UNSUBSCRIBE_FILE':
          if (message.payload?.path) {
            unsubscribe_from_file({ ws, path: message.payload.path })
            log('Client unsubscribed from file: %s', message.payload.path)
          }
          break

        case 'SUBSCRIBE_THREAD':
          if (message.payload?.thread_id) {
            const allowed = await subscribe_to_thread({
              ws,
              thread_id: message.payload.thread_id,
              user_public_key
            })
            if (allowed) {
              log('Client subscribed to thread: %s', message.payload.thread_id)
            } else {
              ws.send(
                JSON.stringify({
                  type: 'SUBSCRIPTION_DENIED',
                  payload: {
                    resource_type: 'thread',
                    thread_id: message.payload.thread_id
                  }
                })
              )
            }
          }
          break

        case 'UNSUBSCRIBE_THREAD':
          if (message.payload?.thread_id) {
            unsubscribe_from_thread({
              ws,
              thread_id: message.payload.thread_id
            })
            log(
              'Client unsubscribed from thread: %s',
              message.payload.thread_id
            )
          }
          break

        default:
          // Unknown message type - ignore
          break
      }
    } catch (error) {
      log('Error parsing WebSocket message: %s', error.message)
    }
  })

  // Clean up subscriptions when connection closes
  ws.on('close', () => {
    remove_all_subscriptions(ws)
    log('WebSocket connection closed, subscriptions cleaned up')
  })
})

export const broadcast_all = (message) => {
  const data = JSON.stringify(message)
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      try {
        c.send(data)
      } catch (error) {
        log('Error broadcasting to client: %s', error.message)
      }
    }
  })
}

/**
 * Broadcast a message only to authenticated WebSocket clients
 * @param {Object} message - The message to broadcast
 */
export const broadcast_authenticated = (message) => {
  const data = JSON.stringify(message)
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN && c.is_authenticated) {
      try {
        c.send(data)
      } catch (error) {
        log('Error broadcasting to authenticated client: %s', error.message)
      }
    }
  })
}

export const send = ({ user_public_key, event }) => {
  const data = JSON.stringify(event)
  wss.clients.forEach((c) => {
    if (
      c.user_public_key === user_public_key &&
      c.readyState === WebSocket.OPEN
    ) {
      try {
        c.send(data)
      } catch (error) {
        log('Error sending to client: %s', error.message)
      }
    }
  })
}

export default wss
