import { Record } from 'immutable'

import { app_actions } from './actions'

const initial_state = new Record({
  is_loaded: false,
  user_id: null,
  username: null,
  public_key: null,
  private_key: null
})

export function app_reducer(state = initial_state(), { payload, type }) {
  switch (type) {
    case app_actions.APP_LOADED:
      return state.merge({ is_loaded: true })

    case app_actions.LOAD_KEYS:
    case app_actions.LOAD_FROM_PRIVATE_KEY:
    case app_actions.LOAD_FROM_NEW_KEYPAIR:
      return state.merge({
        public_key: payload.public_key,
        private_key: payload.private_key
      })

    case app_actions.POST_USER_FULFILLED:
    case app_actions.GET_USER_FULFILLED:
      return state.merge({
        user_id: payload.data.user_id,
        username: payload.data.username
      })

    default:
      return state
  }
}
