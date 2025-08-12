import { create_api_action_types, create_api_actions } from '../utils/index.js'

export const app_actions = {
  APP_LOAD: 'APP_LOAD',
  APP_LOADED: 'APP_LOADED',
  SET_SELECTED_PATH: 'SET_SELECTED_PATH',
  SET_SELECTED_PATH_VIEW_ID: 'SET_SELECTED_PATH_VIEW_ID',
  LOAD_KEYS: 'LOAD_KEYS',
  LOAD_FROM_NEW_KEYPAIR: 'LOAD_FROM_NEW_KEYPAIR',
  LOAD_FROM_PRIVATE_KEY: 'LOAD_FROM_PRIVATE_KEY',

  load: () => ({
    type: app_actions.APP_LOAD
  }),

  loaded: () => ({
    type: app_actions.APP_LOADED
  }),

  set_selected_path: ({ user_public_key, username, database_table_name }) => ({
    type: app_actions.SET_SELECTED_PATH,
    payload: {
      user_public_key,
      username,
      database_table_name
    }
  }),

  set_selected_path_view_id: (view_id) => ({
    type: app_actions.SET_SELECTED_PATH_VIEW_ID,
    payload: {
      view_id
    }
  }),

  load_keys: ({ user_public_key, user_private_key }) => ({
    type: app_actions.LOAD_KEYS,
    payload: {
      user_public_key,
      user_private_key
    }
  }),

  load_from_new_keypair: ({ user_public_key, user_private_key }) => ({
    type: app_actions.LOAD_FROM_NEW_KEYPAIR,
    payload: {
      user_public_key,
      user_private_key
    }
  }),

  load_from_private_key: ({ user_public_key, user_private_key }) => ({
    type: app_actions.LOAD_FROM_PRIVATE_KEY,
    payload: {
      user_public_key,
      user_private_key
    }
  }),

  ...create_api_action_types('POST_USER_SESSION')
}

// API actions
export const post_user_session_request_actions =
  create_api_actions('POST_USER_SESSION')
