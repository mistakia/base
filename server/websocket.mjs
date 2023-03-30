import { WebSocket, WebSocketServer } from 'ws'

// import sockets from './sockets.mjs'

const wss = new WebSocketServer({ noServer: true })

// sockets(wss)

export const send = ({ public_key, event }) => {
  wss.clients.forEach((c) => {
    if (c.public_key === public_key) {
      if (c && c.readyState === WebSocket.OPEN) {
        c.send(JSON.stringify(event))
      }
    }
  })
}

export default wss
