export const websocket_actions = {
  WEBSOCKET_OPEN: 'WEBSOCKET_OPEN',
  WEBSOCKET_CLOSE: 'WEBSOCKET_CLOSE',

  WEBSOCKET_RECONNECTED: 'WEBSOCKET_RECONNECTED',

  reconnected: () => ({
    type: websocket_actions.WEBSOCKET_RECONNECTED
  }),

  close: () => ({
    type: websocket_actions.WEBSOCKET_CLOSE
  }),

  open: () => ({
    type: websocket_actions.WEBSOCKET_OPEN
  })
}
