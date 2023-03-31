import { Map } from 'immutable'

import { user_actions } from './actions'

export function users_reducer(state = new Map(), { payload, type }) {
  switch (type) {
    case user_actions.GET_USER_PENDING:
      return state.set(
        payload.opts.username,
        new Map({
          is_loaded: false,
          username: payload.opts.username
        })
      )

    case user_actions.GET_USER_FAILED:
      return state.setIn([payload.opts.username, 'is_loaded'], true)

    case user_actions.GET_USER_FULFILLED:
      return state.mergeIn([payload.data.username], {
        is_loaded: true,
        ...payload.data
      })

    default:
      return state
  }
}
