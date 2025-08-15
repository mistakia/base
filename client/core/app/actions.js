import { create_api_action_types, create_api_actions } from '../utils/index.js'

export const app_actions = {
  APP_LOAD: 'APP_LOAD',
  APP_LOADED: 'APP_LOADED',
  LOAD_KEYS: 'LOAD_KEYS',
  LOAD_FROM_PRIVATE_KEY: 'LOAD_FROM_PRIVATE_KEY',
  CLEAR_AUTH: 'CLEAR_AUTH',

  load: () => ({
    type: app_actions.APP_LOAD
  }),

  loaded: () => ({
    type: app_actions.APP_LOADED
  }),

  load_keys: ({ user_public_key, user_private_key, user_token }) => ({
    type: app_actions.LOAD_KEYS,
    payload: {
      user_public_key,
      user_private_key,
      user_token
    }
  }),

  load_from_private_key: ({ user_public_key, user_private_key }) => ({
    type: app_actions.LOAD_FROM_PRIVATE_KEY,
    payload: {
      user_public_key,
      user_private_key
    }
  }),

  clear_auth: () => ({
    type: app_actions.CLEAR_AUTH
  }),

  ...create_api_action_types('POST_USER_SESSION')
}

// API actions
export const post_user_session_request_actions =
  create_api_actions('POST_USER_SESSION')
