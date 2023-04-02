export const app_actions = {
  APP_LOAD: 'APP_LOAD',
  APP_LOADED: 'APP_LOADED',

  SET_SELECTED_PATH: 'SET_SELECTED_PATH',
  SET_SELECTED_PATH_VIEW_ID: 'SET_SELECTED_PATH_VIEW_ID',

  LOAD_FROM_NEW_KEYPAIR: 'LOAD_FROM_NEW_KEYPAIR',
  LOAD_FROM_PRIVATE_KEY: 'LOAD_FROM_PRIVATE_KEY',
  LOAD_KEYS: 'LOAD_KEYS',

  POST_USER_SESSION_PENDING: 'POST_USER_SESSION_PENDING',
  POST_USER_SESSION_FAILED: 'POST_USER_SESSION_FAILED',
  POST_USER_SESSION_FULFILLED: 'POST_USER_SESSION_FULFILLED',

  POST_USER_PENDING: 'POST_USER_PENDING',
  POST_USER_FAILED: 'POST_USER_FAILED',
  POST_USER_FULFILLED: 'POST_USER_FULFILLED',

  load: () => ({
    type: app_actions.APP_LOAD
  }),

  loaded: () => ({
    type: app_actions.APP_LOADED
  }),

  set_selected_path: ({ username, user_folder_path, database_table_name }) => ({
    type: app_actions.SET_SELECTED_PATH,
    payload: {
      username,
      user_folder_path,
      database_table_name
    }
  }),

  set_selected_path_view_id: ({ view_id }) => ({
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

  postUserSessionPending: (opts) => ({
    type: app_actions.POST_USER_SESSION_PENDING,
    payload: {
      opts
    }
  }),

  postUserSessionFailed: (opts, error) => ({
    type: app_actions.POST_USER_SESSION_FAILED,
    payload: {
      opts,
      error
    }
  }),

  postUserSessionFullfilled: (opts, data) => ({
    type: app_actions.POST_USER_SESSION_FULFILLED,
    payload: {
      opts,
      data
    }
  }),

  postUserPending: (opts) => ({
    type: app_actions.POST_USER_PENDING,
    payload: {
      opts
    }
  }),

  postUserFailed: (opts, error) => ({
    type: app_actions.POST_USER_FAILED,
    payload: {
      opts,
      error
    }
  }),

  postUserFullfilled: (opts, data) => ({
    type: app_actions.POST_USER_FULFILLED,
    payload: {
      opts,
      data
    }
  })
}

export const post_user_session_request_actions = {
  pending: app_actions.postUserSessionPending,
  failed: app_actions.postUserSessionFailed,
  fulfilled: app_actions.postUserSessionFullfilled
}

export const post_user_request_actions = {
  pending: app_actions.postUserPending,
  failed: app_actions.postUserFailed,
  fulfilled: app_actions.postUserFullfilled
}
