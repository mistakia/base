export const websocket_actions = {
  WEBSOCKET_OPEN: 'WEBSOCKET_OPEN',
  WEBSOCKET_CLOSE: 'WEBSOCKET_CLOSE',

  WEBSOCKET_RECONNECTED: 'WEBSOCKET_RECONNECTED',
  WEBSOCKET_CONNECTION_FAILED: 'WEBSOCKET_CONNECTION_FAILED',

  reconnected: () => ({
    type: websocket_actions.WEBSOCKET_RECONNECTED
  }),

  connection_failed: () => ({
    type: websocket_actions.WEBSOCKET_CONNECTION_FAILED
  }),

  close: () => ({
    type: websocket_actions.WEBSOCKET_CLOSE
  }),

  open: () => ({
    type: websocket_actions.WEBSOCKET_OPEN
  })
}
