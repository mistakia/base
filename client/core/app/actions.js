export const app_actions = {
  APP_LOAD: 'APP_LOAD',
  APP_LOADED: 'APP_LOADED',

  LOAD_FROM_NEW_KEYPAIR: 'LOAD_FROM_NEW_KEYPAIR',
  LOAD_FROM_PRIVATE_KEY: 'LOAD_FROM_PRIVATE_KEY',
  LOAD_KEYS: 'LOAD_KEYS',

  GET_USER_PENDING: 'GET_USER_PENDING',
  GET_USER_FAILED: 'GET_USER_FAILED',
  GET_USER_FULFILLED: 'GET_USER_FULFILLED',

  POST_USER_PENDING: 'POST_USER_PENDING',
  POST_USER_FAILED: 'POST_USER_FAILED',
  POST_USER_FULFILLED: 'POST_USER_FULFILLED',

  load: () => ({
    type: app_actions.APP_LOAD
  }),

  loaded: () => ({
    type: app_actions.APP_LOADED
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

  getUserPending: (opts) => ({
    type: app_actions.GET_USER_PENDING,
    payload: {
      opts
    }
  }),

  getUserFailed: (opts, error) => ({
    type: app_actions.GET_USER_FAILED,
    payload: {
      opts,
      error
    }
  }),

  getUserFullfilled: (opts, data) => ({
    type: app_actions.GET_USER_FULFILLED,
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

export const get_user_request_actions = {
  pending: app_actions.getUserPending,
  failed: app_actions.getUserFailed,
  fulfilled: app_actions.getUserFullfilled
}

export const post_user_request_actions = {
  pending: app_actions.postUserPending,
  failed: app_actions.postUserFailed,
  fulfilled: app_actions.postUserFullfilled
}
