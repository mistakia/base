import { Record } from 'immutable'

import { app_actions } from './actions'

const initial_state = new Record({
  is_loaded: false
})

export function app_reducer(state = initial_state(), { payload, type }) {
  switch (type) {
    case app_actions.APP_LOADED:
      return state.merge({ is_loaded: true })

    default:
      return state
  }
}
