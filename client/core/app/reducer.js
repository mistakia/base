import { Record } from 'immutable'

import { app_actions } from './actions'

const initialState = new Record({
  isLoaded: false,
  public_key: null
})

export function app_reducer(state = initialState(), { payload, type }) {
  switch (type) {
    case app_actions.APP_LOADED:
      return state.merge({ isLoaded: true })

    default:
      return state
  }
}
