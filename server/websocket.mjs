import { WebSocket, WebSocketServer } from 'ws'
import debug from 'debug'

import {
  subscribe_to_file,
  unsubscribe_from_file,
  remove_connection
} from '#libs-server/file-subscriptions/index.mjs'

const log = debug('websocket')

const wss = new WebSocketServer({ noServer: true })

// Handle new WebSocket connections
wss.on('connection', (ws) => {
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
  wss.clients.forEach((c) => {
    if (
      c.user_public_key === user_public_key &&
      c.readyState === WebSocket.OPEN
    ) {
      c.send(JSON.stringify(event))
    }
  })
}

export default wss
