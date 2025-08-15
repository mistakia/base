import { Record } from 'immutable'

import { app_actions } from './actions'

const initial_state = new Record({
  is_loaded: false,
  user_private_key: null,
  user_public_key: null,
  user_token: null,
  current_user: null,
  is_establishing_session: false,
  session_error: null
})

export function app_reducer(state = initial_state(), { payload, type }) {
  switch (type) {
    case app_actions.APP_LOADED:
      return state.merge({ is_loaded: true })

    case app_actions.LOAD_KEYS:
      return state.merge({
        user_private_key: payload.user_private_key,
        user_public_key: payload.user_public_key,
        user_token: payload.user_token
      })

    case app_actions.LOAD_FROM_PRIVATE_KEY:
      return state.merge({
        user_private_key: payload.user_private_key,
        user_public_key: payload.user_public_key
      })

    case app_actions.POST_USER_SESSION_PENDING:
      return state.merge({
        is_establishing_session: true,
        session_error: null
      })

    case app_actions.POST_USER_SESSION_FULFILLED:
      return state.merge({
        is_establishing_session: false,
        user_token: payload.data.token,
        current_user: payload.data.username
          ? {
              username: payload.data.username,
              user_public_key: payload.data.user_public_key
            }
          : null,
        session_error: null
      })

    case app_actions.POST_USER_SESSION_FAILED:
      return state.merge({
        is_establishing_session: false,
        session_error: payload.error
      })

    case app_actions.CLEAR_AUTH:
      return state.merge({
        user_private_key: null,
        user_public_key: null,
        user_token: null,
        current_user: null,
        is_establishing_session: false,
        session_error: null
      })

    default:
      return state
  }
}
