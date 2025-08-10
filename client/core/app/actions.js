import {
  create_api_actions,
  create_api_action_types
} from '../utils/actions-utils'

export const app_actions = {
  APP_LOAD: 'APP_LOAD',
  APP_LOADED: 'APP_LOADED',

  SET_SELECTED_PATH: 'SET_SELECTED_PATH',
  SET_SELECTED_PATH_VIEW_ID: 'SET_SELECTED_PATH_VIEW_ID',

  LOAD_FROM_NEW_KEYPAIR: 'LOAD_FROM_NEW_KEYPAIR',
  LOAD_FROM_PRIVATE_KEY: 'LOAD_FROM_PRIVATE_KEY',
  LOAD_KEYS: 'LOAD_KEYS',

  load: () => ({
    type: app_actions.APP_LOAD
  }),

  loaded: () => ({
    type: app_actions.APP_LOADED
  }),

  set_selected_path: ({ user_id, username, database_table_name }) => ({
    type: app_actions.SET_SELECTED_PATH,
    payload: {
      user_id,
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

  load_keys: ({ public_key, private_key }) => ({
    type: app_actions.LOAD_KEYS,
    payload: {
      public_key,
      private_key
    }
  }),

  load_from_new_keypair: ({ public_key, private_key }) => ({
    type: app_actions.LOAD_FROM_NEW_KEYPAIR,
    payload: {
      public_key,
      private_key
    }
  }),

  load_from_private_key: ({ public_key, private_key }) => ({
    type: app_actions.LOAD_FROM_PRIVATE_KEY,
    payload: {
      public_key,
      private_key
    }
  }),

  ...create_api_action_types('POST_USER_SESSION')
}

export const post_user_session_request_actions =
  create_api_actions('POST_USER_SESSION')
