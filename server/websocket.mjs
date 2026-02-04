import { WebSocket, WebSocketServer } from 'ws'
import debug from 'debug'

import {
  subscribe_to_file,
  unsubscribe_from_file,
  remove_connection
} from '#libs-server/file-subscriptions/index.mjs'

const log = debug('websocket')

const HEARTBEAT_INTERVAL_MS = 30000

const wss = new WebSocketServer({ noServer: true })

// Heartbeat: detect and clean up dead connections
const heartbeat_interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.is_alive === false) {
      log('Terminating unresponsive WebSocket connection')
      remove_connection(ws)
      return ws.terminate()
    }

    ws.is_alive = false
    ws.ping()
  })
}, HEARTBEAT_INTERVAL_MS)

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
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())

      switch (message.type) {
        case 'SUBSCRIBE_FILE':
          if (message.payload?.path) {
            subscribe_to_file({ ws, path: message.payload.path })
            log('Client subscribed to file: %s', message.payload.path)
          }
          break

        case 'UNSUBSCRIBE_FILE':
          if (message.payload?.path) {
            unsubscribe_from_file({ ws, path: message.payload.path })
            log('Client unsubscribed from file: %s', message.payload.path)
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
    remove_connection(ws)
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
