/* global WebSocket, setInterval, clearInterval */

import queryString from 'query-string'

import { WEBSOCKET_URL } from '@core/constants'
import StoreRegistry from '@core/store-registry'

import { websocket_actions } from './actions'

export let ws = null
let messages = []
let interval = null

const keepalive_message = JSON.stringify({ type: 'KEEPALIVE' })
const keepalive = () => {
  if (ws && ws.readyState === 1) ws.send(keepalive_message)
}

export const open_websocket = (params) => {
  if (ws && ws.close) ws.close()
  console.log('connecting to websocket...')
  ws = new WebSocket(`${WEBSOCKET_URL}?${queryString.stringify(params)}`)

  ws.onopen = () => {
    const store = StoreRegistry.getStore()
    console.log('connected to websocket')
    store.dispatch(websocket_actions.open())
    messages.forEach((msg) => ws.send(JSON.stringify(msg)))
    messages = []

    interval = setInterval(keepalive, 30000)

    ws.onclose = () => {
      const store = StoreRegistry.getStore()
      console.log('disconnected from websocket')
      store.dispatch(websocket_actions.close())
      clearInterval(interval)
    }
  }

  ws.onmessage = (event) => {
    const store = StoreRegistry.getStore()
    const message = JSON.parse(event.data)
    console.log(`websocket message: ${message.type}`)
    store.dispatch(message)
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
