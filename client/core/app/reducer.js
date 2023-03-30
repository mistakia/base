import { Record } from 'immutable'

import { app_actions } from './actions'

const initial_state = new Record({
  is_loaded: false,
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

    default:
      return state
  }
}
