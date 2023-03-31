export const user_actions = {
  LOAD_USER: 'LOAD_USER',

  GET_USER_PENDING: 'GET_USER_PENDING',
  GET_USER_FAILED: 'GET_USER_FAILED',
  GET_USER_FULFILLED: 'GET_USER_FULFILLED',

  load: ({ username }) => ({
    type: user_actions.LOAD_USER,
    payload: {
      username
    }
  }),

  getUserPending: (opts) => ({
    type: user_actions.GET_USER_PENDING,
    payload: {
      opts
    }
  }),

  getUserFailed: (opts, error) => ({
    type: user_actions.GET_USER_FAILED,
    payload: {
      opts,
      error
    }
  }),

  getUserFullfilled: (opts, data) => ({
    type: user_actions.GET_USER_FULFILLED,
    payload: {
      opts,
      data
    }
  })
}

export const get_user_request_actions = {
  pending: user_actions.getUserPending,
  failed: user_actions.getUserFailed,
  fulfilled: user_actions.getUserFullfilled
}
