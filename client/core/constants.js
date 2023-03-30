/* global IS_DEV */

//= ====================================
//  GENERAL
// -------------------------------------
export const BASE_URL = IS_DEV
  ? 'http://localhost:8080'
  : 'https://base.tint.space'
export const API_URL = `${BASE_URL}/api`
export const WEBSOCKET_URL = IS_DEV
  ? 'ws://localhost:8080'
  : 'wss://base.tint.space'
